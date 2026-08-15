// @effect-diagnostics anyUnknownInErrorContext:off strictEffectProvide:off nodeBuiltinImport:off globalFetch:off strictBooleanExpressions:off missingEffectError:off
import { Credentials, fromADC } from "@microagi/alchemy-gcp"
import { Effect, Redacted } from "effect"
import { readFile } from "node:fs/promises"
import { StorageObjectClientError, StorageObjectProvider, type StorageObjectClient, type StorageObjectMetadata, type StorageObjectProps } from "./storage-object.ts"

export interface StorageObjectRequestInit { readonly method?: string; readonly headers?: Readonly<Record<string, string>>; readonly body?: Uint8Array }
export interface StorageObjectHttpResponse { readonly status: number; readonly json: () => Promise<unknown> }
export interface StorageObjectLiveOptions {
  readonly project: string
  /** Numeric project owner returned by GCS bucket metadata. Required to mutate anything. */
  readonly projectNumber?: string
  readonly buckets?: ReadonlyArray<string>
  readonly request?: (url: string, init: StorageObjectRequestInit) => Promise<StorageObjectHttpResponse>
  readonly readSource?: (path: string) => Promise<Uint8Array>
  readonly accessToken?: () => Effect.Effect<string, unknown>
}
const encode = encodeURIComponent
const code = (status: number): StorageObjectClientError["code"] => status === 404 ? "not-found" : status === 403 ? "forbidden" : status === 409 || status === 412 ? "conflict" : status === 400 ? "invalid" : "unknown"
const fail = (operation: string, status?: number) => new StorageObjectClientError({ operation, code: status === undefined ? "unknown" : code(status) })
const record = (value: unknown, operation: string): Record<string, unknown> => { if (typeof value !== "object" || value === null) throw fail(operation); return value as Record<string, unknown> }
const string = (value: unknown, operation: string) => { if (typeof value !== "string" || value.length === 0) throw fail(operation); return value }
const metadata = (bucket: string, value: unknown, operation: string): StorageObjectMetadata => { const v = record(value, operation); const custom = typeof v.metadata === "object" && v.metadata !== null ? v.metadata as Record<string, unknown> : {}; return { bucket, name: string(v.name, operation), ...(typeof custom["proxus-source-sha256"] === "string" ? { sourceSha256: custom["proxus-source-sha256"] } : {}), ...(typeof v.contentType === "string" ? { contentType: v.contentType } : {}), ...(typeof v.cacheControl === "string" ? { cacheControl: v.cacheControl } : {}), generation: string(v.generation, operation), etag: string(v.etag, operation) } }

export const makeLiveStorageObjectClient = (options: StorageObjectLiveOptions): StorageObjectClient => {
  const request: NonNullable<StorageObjectLiveOptions["request"]> = options.request ?? ((url, init) => fetch(url, init as RequestInit))
  const token = options.accessToken ?? (() => Credentials.pipe(Effect.flatMap((service) => service), Effect.map((credentials) => Redacted.value(credentials.accessToken)), Effect.provide(fromADC())))
  const call = (operation: string, url: string, init: StorageObjectRequestInit = {}) => token().pipe(Effect.flatMap((accessToken) => Effect.tryPromise({ try: () => request(url, { ...init, headers: { authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) } }), catch: () => fail(operation) })), Effect.flatMap((response) => response.status >= 200 && response.status < 300 ? Effect.succeed(response) : Effect.fail(fail(operation, response.status))))
  const owned = new Map<string, boolean>()
  const assertOwnedBucket = (bucket: string) => Effect.gen(function* () { if (owned.get(bucket)) return; if (!options.projectNumber || !(options.buckets ?? []).includes(bucket)) return yield* new StorageObjectClientError({ operation: "verify-bucket", code: "foreign-bucket" }); const response = yield* call("verify-bucket", `https://storage.googleapis.com/storage/v1/b/${encode(bucket)}`); const body = yield* Effect.tryPromise({ try: () => response.json(), catch: () => fail("verify-bucket") }); if (record(body, "verify-bucket").projectNumber !== options.projectNumber) return yield* new StorageObjectClientError({ operation: "verify-bucket", code: "foreign-bucket" }); owned.set(bucket, true) })
  const get = (bucket: string, name: string) => call("get-object", `https://storage.googleapis.com/storage/v1/b/${encode(bucket)}/o/${encode(name)}`).pipe(Effect.flatMap((r) => Effect.tryPromise({ try: () => r.json(), catch: () => fail("get-object") })), Effect.map((v) => metadata(bucket, v, "get-object")))
  return {
    assertOwnedBucket, get,
    list: () => Effect.all((options.buckets ?? []).map((bucket) => assertOwnedBucket(bucket).pipe(Effect.flatMap(() => call("list-objects", `https://storage.googleapis.com/storage/v1/b/${encode(bucket)}/o`)), Effect.flatMap((r) => Effect.tryPromise({ try: () => r.json(), catch: () => fail("list-objects") })), Effect.map((v) => { const items = record(v, "list-objects").items; if (items === undefined) return []; if (!Array.isArray(items)) throw fail("list-objects"); return items.map((item) => metadata(bucket, item, "list-objects")) }))), { concurrency: 1 }).pipe(Effect.map((groups) => groups.flat())),
    upload: (props: StorageObjectProps, expectedGeneration: string) => Effect.gen(function* () { const data = yield* Effect.tryPromise({ try: () => (options.readSource ?? readFile)(props.source.path), catch: () => fail("read-source") }); if (data.byteLength !== props.source.size) return yield* new StorageObjectClientError({ operation: "read-source", code: "invalid" }); const url = `https://storage.googleapis.com/upload/storage/v1/b/${encode(props.bucket)}/o?uploadType=media&name=${encode(props.name)}&ifGenerationMatch=${encode(expectedGeneration)}`; const response = yield* call("upload-object", url, { method: "POST", body: data, headers: { "content-type": props.contentType, "cache-control": props.cacheControl, "x-goog-meta-proxus-source-sha256": props.source.sha256 } }); const body = yield* Effect.tryPromise({ try: () => response.json(), catch: () => fail("upload-object") }); return metadata(props.bucket, body, "upload-object") }),
    delete: (bucket, name, generation) => call("delete-object", `https://storage.googleapis.com/storage/v1/b/${encode(bucket)}/o/${encode(name)}?ifGenerationMatch=${encode(generation)}`, { method: "DELETE" }).pipe(Effect.asVoid),
  } as StorageObjectClient
}
export const storageObjectLiveLayer = (options: StorageObjectLiveOptions) => StorageObjectProvider(makeLiveStorageObjectClient(options))
