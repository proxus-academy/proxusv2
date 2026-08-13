import { Effect, Layer, Stream } from "effect"
import {
  HttpRouter,
  HttpServerResponse,
  type HttpServerRequest,
} from "effect/unstable/http"
import { ObjectStorage, ObjectStorageError } from "./object-storage.js"
import { LocalObjectStorageTransfers } from "./object-storage.local.js"

const tokenFromUrl = (url: string): string => {
  const pathname = new URL(url, "http://local").pathname
  return decodeURIComponent(pathname.slice(pathname.lastIndexOf("/") + 1))
}

const keyFromUrl = (url: string, prefix: string): string => {
  const pathname = new URL(url, "http://local").pathname
  return pathname.slice(prefix.length).split("/").filter(Boolean).map(decodeURIComponent).join("/")
}

const causeHasTag = (cause: unknown, tag: string): boolean =>
  // SAFETY: Runtime representation is checked at this boundary before use.
  typeof cause === "object" && cause !== null && "_tag" in cause &&
    (cause._tag === tag || ("cause" in cause && causeHasTag(cause.cause, tag)))

const errorTag = (cause: unknown): string | undefined =>
  // SAFETY: Runtime representation is checked at this boundary before use.
  typeof cause === "object" && cause !== null && "_tag" in cause && typeof cause._tag === "string"
    ? cause._tag
    : undefined

const errorResponse = (cause: unknown) => {
  if (causeHasTag(cause, "UploadTooLarge")) {
    return HttpServerResponse.empty({ status: 413 })
  }

  switch (errorTag(cause)) {
    case "ObjectNotFound":
      return HttpServerResponse.empty({ status: 404 })
    case "ObjectAlreadyExists":
      return HttpServerResponse.empty({ status: 409 })
    case "InvalidObjectKey":
    case "InvalidTransferToken":
      return HttpServerResponse.empty({ status: 400 })
    case "ExpiredTransferToken":
      return HttpServerResponse.empty({ status: 410 })
    default:
      return HttpServerResponse.empty({ status: 500 })
  }
}

const limitBytes = (
  body: Stream.Stream<Uint8Array, ObjectStorageError>,
  maximum: number,
  key: string,
): Stream.Stream<Uint8Array, ObjectStorageError> =>
  body.pipe(Stream.mapAccumEffect(() => 0, (total, chunk) => {
    const next = total + chunk.byteLength
    return next > maximum
      ? Effect.fail(new ObjectStorageError({
          operation: "upload",
          key,
          cause: { _tag: "UploadTooLarge" },
        }))
      : Effect.succeed([next, [chunk]] as const)
  }))

const normalizeRoutePath = (value: string): `/${string}` =>
  `/${value.split("/").filter(Boolean).join("/")}`

export interface LocalObjectStorageHttpOptions {
  readonly publicPath?: string
  readonly transferPath?: string
}

/** Isolated local routes; they are not provided to the active server. */
export const httpLayer = (
  options: LocalObjectStorageHttpOptions = {},
): Layer.Layer<never, never, HttpRouter.HttpRouter | ObjectStorage | LocalObjectStorageTransfers> => {
  const publicPath = normalizeRoutePath(options.publicPath ?? "/objects")
  const transferPath = normalizeRoutePath(options.transferPath ?? "/object-transfers")

  return HttpRouter.use((router) => Effect.gen(function*() {
    const storage = yield* ObjectStorage
    const transfers = yield* LocalObjectStorageTransfers

    yield* router.add("PUT", `${transferPath}/upload/*`, (request) =>
      Effect.gen(function*() {
        const claims = yield* transfers.verify(tokenFromUrl(request.url), "upload")
        const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim()
        if (claims.contentType !== undefined && contentType !== claims.contentType) {
          return HttpServerResponse.empty({ status: 415 })
        }
        const declaredLength = Number(request.headers["content-length"])
        if (
          claims.maxContentLength !== undefined &&
          Number.isFinite(declaredLength) && declaredLength > claims.maxContentLength
        ) return HttpServerResponse.empty({ status: 413 })

        const body = request.stream.pipe(
          Stream.mapError((cause) => new ObjectStorageError({
            operation: "upload",
            key: claims.key,
            cause,
          })),
        )
        yield* storage.put({
          key: claims.key,
          contentType: claims.contentType ?? "application/octet-stream",
          body: claims.maxContentLength === undefined
            ? body
            : limitBytes(body, claims.maxContentLength, claims.key),
        })
        return HttpServerResponse.empty({ status: 201 })
      }).pipe(Effect.catchEager((cause) =>
        Effect.succeed(errorResponse(cause)))),
    )

    const download = (request: HttpServerRequest.HttpServerRequest) =>
      Effect.gen(function*() {
        const claims = yield* transfers.verify(tokenFromUrl(request.url), "download")
        const object = yield* storage.get(claims.key)
        return HttpServerResponse.stream(object.body, {
          contentType: object.contentType,
          contentLength: Number(object.contentLength),
        })
      }).pipe(Effect.catchEager((cause) =>
        Effect.succeed(errorResponse(cause))))

    yield* router.add("GET", `${transferPath}/download/*`, download)

    const publicDownload = (request: HttpServerRequest.HttpServerRequest) =>
      storage.get(keyFromUrl(request.url, publicPath)).pipe(
        Effect.map((object) => HttpServerResponse.stream(object.body, {
          contentType: object.contentType,
          contentLength: Number(object.contentLength),
          headers: { "cache-control": "public, max-age=31536000, immutable" },
        })),
        Effect.catchEager((cause) => Effect.succeed(errorResponse(cause))),
      )

    // HttpRouter automatically falls back from HEAD to GET. The Web response
    // adapter removes the body while retaining the GET headers.
    yield* router.add("GET", `${publicPath}/*`, publicDownload)
  }))
}
