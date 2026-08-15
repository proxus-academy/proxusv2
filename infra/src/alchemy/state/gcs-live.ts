// A missing GCS object is represented by a successful undefined value.
// @effect-diagnostics effectSucceedWithVoid:off
import { Context, Effect, Layer } from "effect"
import { StateBackendError, StateConflictError, type GcsClient } from "./gcs-state.ts"

interface GoogleAccessToken { readonly get: Effect.Effect<string, StateBackendError> }
export interface HttpResponse {
  readonly status: number
  readonly headers: Readonly<Record<string, string | undefined>>
  readonly body: Uint8Array
}
export interface GoogleHttpClient {
  readonly request: (request: {
    readonly method: "GET" | "POST" | "DELETE"
    readonly url: string
    readonly headers: Readonly<Record<string, string>>
    readonly body?: Uint8Array
  }) => Effect.Effect<HttpResponse, StateBackendError>
}
export interface LiveGcsOptions {
  readonly bucket: string
  readonly token: GoogleAccessToken
  readonly http: GoogleHttpClient
  /** Test seams; production uses bounded full-jitter exponential backoff. */
  readonly sleep?: (milliseconds: number) => Effect.Effect<void>
  readonly random?: () => number
  readonly now?: () => number
  readonly maxAttempts?: number
}

class GcsLive extends Context.Service<GcsLive, GcsClient>()("@proxus/infra/alchemy/state/gcs-live/GcsLive") {}

const text = new TextDecoder()
const encode = encodeURIComponent
const backend = (operation: string, cause?: unknown, status?: number, attempt?: number) => new StateBackendError({
  operation,
  ...(status === undefined ? {} : { status }),
  ...(attempt === undefined ? {} : { attempt }),
  ...(cause === undefined ? {} : { cause }),
})
const json = (response: HttpResponse, operation: string): Record<string, unknown> => {
  try { return JSON.parse(text.decode(response.body)) as Record<string, unknown> } catch (cause) { throw backend(operation, cause) }
}
const generation = (value: unknown, operation: string) => {
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw backend(operation)
  return value
}

/**
 * GCS media download/upload is deliberately implemented against the JSON API.
 * distilled 0.30.2 models metadata JSON but its generated codecs cannot carry
 * raw media bodies or expose download response headers, which are required for
 * generation-safe state reads.
 */
export const makeLiveGcsClient = ({ bucket, token, http, sleep = (milliseconds) => Effect.sleep(`${milliseconds} millis`), random = Math.random, now = Date.now, maxAttempts = 5 }: LiveGcsOptions): GcsClient => {
  const retryable = (status: number) => status === 429 || (status >= 500 && status <= 599)
  const retryAfter = (headers: HttpResponse["headers"], attempt: number) => {
    const raw = Object.entries(headers).find(([name]) => name.toLowerCase() === "retry-after")?.[1]
    const seconds = raw === undefined ? Number.NaN : Number(raw)
    const requested = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : raw === undefined ? Number.NaN : Date.parse(raw) - now()
    const exponential = Math.min(5_000, 200 * 2 ** (attempt - 1))
    return Math.min(5_000, Math.max(0, Number.isFinite(requested) ? requested : random() * exponential))
  }
  const call = (operation: string, method: "GET" | "POST" | "DELETE", url: string, body?: Uint8Array) => {
    const attemptRequest = (attempt: number): Effect.Effect<HttpResponse & { readonly attempt: number }, StateBackendError> => token.get.pipe(
      Effect.mapError((cause) => backend(`${operation}-auth`, cause, undefined, attempt)),
      Effect.flatMap((accessToken) => http.request({ method, url, headers: {
        authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { "content-type": "application/octet-stream" }),
      }, ...(body === undefined ? {} : { body }) }).pipe(Effect.mapError((cause) => backend(operation, cause, undefined, attempt)))),
      Effect.flatMap((response) => retryable(response.status)
        ? attempt < maxAttempts
          ? sleep(retryAfter(response.headers, attempt)).pipe(Effect.andThen(attemptRequest(attempt + 1)))
          : Effect.fail(backend(`${operation}-status`, undefined, response.status, attempt))
        : Effect.succeed({ ...response, attempt })), 
    )
    return attemptRequest(1)
  }
  const base = `https://storage.googleapis.com/storage/v1/b/${encode(bucket)}`
  return {
    read: (object) => call("gcs-read", "GET", `${base}/o/${encode(object)}?alt=media`).pipe(Effect.flatMap((response) => {
      if (response.status === 404) return Effect.succeed(undefined)
      if (response.status === 403) return Effect.fail(backend("gcs-read-forbidden", undefined, response.status, response.attempt))
      if (response.status < 200 || response.status >= 300) return Effect.fail(backend("gcs-read-status", undefined, response.status, response.attempt))
      return Effect.try({ try: () => ({ data: response.body.slice(), generation: generation(response.headers["x-goog-generation"], "gcs-read-generation") }), catch: (cause) => cause instanceof StateBackendError ? cause : backend("gcs-read", cause) })
    })),
    write: (object, data, expectedGeneration) => call("gcs-write", "POST", `https://storage.googleapis.com/upload/storage/v1/b/${encode(bucket)}/o?uploadType=media&name=${encode(object)}&ifGenerationMatch=${encode(expectedGeneration)}`, data).pipe(Effect.flatMap((response): Effect.Effect<string, StateConflictError | StateBackendError> => {
      if (response.status === 409 || response.status === 412 || response.status === 404) return Effect.fail(new StateConflictError({ object }))
      if (response.status === 403) return Effect.fail(backend("gcs-write-forbidden", undefined, response.status, response.attempt))
      if (response.status < 200 || response.status >= 300) return Effect.fail(backend("gcs-write-status", undefined, response.status, response.attempt))
      return Effect.try({ try: () => generation(json(response, "gcs-write-json").generation, "gcs-write-generation"), catch: (cause) => cause instanceof StateBackendError ? cause : backend("gcs-write", cause) })
    })),
    delete: (object, expectedGeneration) => call("gcs-delete", "DELETE", `${base}/o/${encode(object)}?ifGenerationMatch=${encode(expectedGeneration)}`).pipe(Effect.flatMap((response): Effect.Effect<void, StateConflictError | StateBackendError> => {
      if (response.status === 404 || response.status === 409 || response.status === 412) return Effect.fail(new StateConflictError({ object }))
      if (response.status === 403) return Effect.fail(backend("gcs-delete-forbidden", undefined, response.status, response.attempt))
      if (response.status < 200 || response.status >= 300) return Effect.fail(backend("gcs-delete-status", undefined, response.status, response.attempt))
      return Effect.void
    })),
    list: (prefix) => {
      const loop = (pageToken?: string): Effect.Effect<ReadonlyArray<string>, StateBackendError> => call("gcs-list", "GET", `${base}/o?prefix=${encode(prefix)}${pageToken === undefined ? "" : `&pageToken=${encode(pageToken)}`}`).pipe(Effect.flatMap((response) => {
        if (response.status === 403 || response.status === 404) return Effect.fail(backend("gcs-list-denied", undefined, response.status, response.attempt))
        if (response.status < 200 || response.status >= 300) return Effect.fail(backend("gcs-list-status", undefined, response.status, response.attempt))
        return Effect.try({ try: () => json(response, "gcs-list-json"), catch: (cause) => cause instanceof StateBackendError ? cause : backend("gcs-list", cause) }).pipe(Effect.flatMap((value) => {
          const items = value.items === undefined ? [] : value.items
          if (!Array.isArray(items) || !items.every((item) => typeof item === "object" && item !== null && typeof (item as { name?: unknown }).name === "string")) return Effect.fail(backend("gcs-list-shape"))
          const names = items.map((item) => (item as { name: string }).name)
          return typeof value.nextPageToken === "string" ? loop(value.nextPageToken).pipe(Effect.map((rest) => [...names, ...rest])) : Effect.succeed(names)
        }))
      }))
      return loop()
    },
  }
}

const gcsLiveLayer = (options: LiveGcsOptions) => Layer.succeed(GcsLive, makeLiveGcsClient(options))
