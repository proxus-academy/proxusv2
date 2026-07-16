import { createHmac, timingSafeEqual } from "node:crypto"
// @effect-diagnostics preferSchemaOverJson:off globalDate:off globalDateInEffect:off
import { Context, Effect, FileSystem, Layer, Path, Schema, Stream } from "effect"
import {
  InvalidObjectKey,
  ObjectAlreadyExists,
  ObjectNotFound,
  ObjectStorage,
  ObjectStorageError,
  type ObjectKey,
} from "./object-storage.js"

const bodyFileName = "body"
const metadataFileName = "metadata.json"
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/

interface Metadata {
  readonly contentType: string
}

interface TransferClaims {
  readonly version: 1
  readonly operation: "upload" | "download"
  readonly key: string
  readonly expiresAt: number
  readonly contentType?: string
  readonly maxContentLength?: number
}

export interface LocalObjectStorageOptions {
  readonly root: string
  readonly publicBaseUrl: string
  readonly publicPath?: string
  readonly transferPath?: string
  readonly signingSecret: string
}

const storageError = (operation: string, key: string, cause: unknown) =>
  new ObjectStorageError({ operation, key, cause })

const isPlatformReason = (cause: unknown, tag: string): boolean =>
  typeof cause === "object" && cause !== null &&
  "reason" in cause && typeof cause.reason === "object" && cause.reason !== null &&
  "_tag" in cause.reason && cause.reason._tag === tag

const validateKey = (key: string): Effect.Effect<ObjectKey, InvalidObjectKey> =>
  key.length <= 1024 && keyPattern.test(key) &&
      !key.split("/").some((segment) => segment === "." || segment === "..")
    ? Effect.succeed(key as ObjectKey)
    : Effect.fail(new InvalidObjectKey({ key }))

const normalizePrefix = (value: string): string =>
  `/${value.split("/").filter(Boolean).join("/")}`

const appendUrlPath = (base: string, prefix: string, suffix: string): string =>
  `${base.replace(/\/$/, "")}${normalizePrefix(prefix)}/${suffix}`

const encodeKey = (key: string): string =>
  key.split("/").map(encodeURIComponent).join("/")

const encodeClaims = (claims: TransferClaims, secret: string): string => {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url")
  const signature = createHmac("sha256", secret).update(payload).digest("base64url")
  return `${payload}.${signature}`
}

const decodeClaims = (
  token: string,
  secret: string,
): Effect.Effect<TransferClaims, InvalidTransferToken> =>
  Effect.try({
    try: () => {
      const [payload, encodedSignature, extra] = token.split(".")
      if (payload === undefined || payload === "" || encodedSignature === undefined || encodedSignature === "" || extra !== undefined) throw new Error("Malformed token")
      const actual = Buffer.from(encodedSignature, "base64url")
      const expected = createHmac("sha256", secret).update(payload).digest()
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        throw new Error("Invalid signature")
      }
      const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
      if (
        typeof value !== "object" || value === null ||
        !("version" in value) || value.version !== 1 ||
        !("operation" in value) || (value.operation !== "upload" && value.operation !== "download") ||
        !("key" in value) || typeof value.key !== "string" ||
        !("expiresAt" in value) || typeof value.expiresAt !== "number"
      ) throw new Error("Invalid claims")
      return value as TransferClaims
    },
    catch: () => new InvalidTransferToken(),
  })

export class InvalidTransferToken extends Schema.TaggedErrorClass<InvalidTransferToken>()(
  "InvalidTransferToken",
  {},
) {}

export class ExpiredTransferToken extends Schema.TaggedErrorClass<ExpiredTransferToken>()(
  "ExpiredTransferToken",
  {},
) {}

export class LocalObjectStorageTransfers extends Context.Service<
  LocalObjectStorageTransfers,
  {
    readonly verify: (
      token: string,
      operation: "upload" | "download",
    ) => Effect.Effect<TransferClaims, InvalidTransferToken | ExpiredTransferToken | InvalidObjectKey>
  }
>()("@proxus/server/infrastructure/object-storage/object-storage.local/LocalObjectStorageTransfers") {}

export const layer = (options: LocalObjectStorageOptions): Layer.Layer<
  ObjectStorage | LocalObjectStorageTransfers,
  ObjectStorageError,
  FileSystem.FileSystem | Path.Path
> => Layer.effectContext(Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = path.resolve(options.root)
  const publicPath = options.publicPath ?? "/objects"
  const transferPath = options.transferPath ?? "/object-transfers"

  if (options.signingSecret.length < 32) {
    return yield* storageError("configure", "", "signingSecret must contain at least 32 characters")
  }

  yield* fs.makeDirectory(root, { recursive: true }).pipe(
    Effect.mapError((cause) => storageError("initialize", "", cause)),
  )

  const objectDirectory = (key: ObjectKey) => path.join(root, ...key.split("/"))

  const put = Effect.fn("LocalObjectStorage.put")(function*(input: {
    readonly key: string
    readonly contentType: string
    readonly body: Stream.Stream<Uint8Array, ObjectStorageError>
  }) {
    const key = yield* validateKey(input.key)
    const destination = objectDirectory(key)
    const parent = path.dirname(destination)
    const alreadyExists = yield* fs.exists(destination).pipe(
      Effect.mapError((cause) => storageError("put", key, cause)),
    )
    if (alreadyExists) return yield* new ObjectAlreadyExists({ key })
    yield* fs.makeDirectory(parent, { recursive: true }).pipe(
      Effect.mapError((cause) => storageError("put", key, cause)),
    )
    const temporary = yield* fs.makeTempDirectory({ directory: parent, prefix: ".upload-" }).pipe(
      Effect.mapError((cause) => storageError("put", key, cause)),
    )

    return yield* Effect.acquireUseRelease(
      Effect.succeed(temporary),
      (directory) => Effect.gen(function*() {
        yield* input.body.pipe(
          Stream.run(fs.sink(path.join(directory, bodyFileName), { flag: "wx" })),
          Effect.mapError((cause) => storageError("put", key, cause)),
        )
        yield* fs.writeFile(
          path.join(directory, metadataFileName),
          new TextEncoder().encode(JSON.stringify({ contentType: input.contentType } satisfies Metadata)),
          { flag: "wx" },
        ).pipe(Effect.mapError((cause) => storageError("put", key, cause)))
        yield* fs.rename(directory, destination).pipe(
          Effect.mapError((cause) => isPlatformReason(cause, "AlreadyExists")
            ? new ObjectAlreadyExists({ key })
            : storageError("put", key, cause)),
        )
        return key
      }),
      (directory) => fs.remove(directory, { recursive: true, force: true }).pipe(Effect.ignore),
    )
  })

  const get = Effect.fn("LocalObjectStorage.get")(function*(rawKey: string) {
    const key = yield* validateKey(rawKey)
    const directory = objectDirectory(key)
    const metadataBytes = yield* fs.readFile(path.join(directory, metadataFileName)).pipe(
      Effect.mapError((cause) => isPlatformReason(cause, "NotFound")
        ? new ObjectNotFound({ key })
        : storageError("get", key, cause)),
    )
    const metadata = yield* Effect.try({
      try: () => JSON.parse(new TextDecoder().decode(metadataBytes)) as Metadata,
      catch: (cause) => storageError("get", key, cause),
    })
    const info = yield* fs.stat(path.join(directory, bodyFileName)).pipe(
      Effect.mapError((cause) => isPlatformReason(cause, "NotFound")
        ? new ObjectNotFound({ key })
        : storageError("get", key, cause)),
    )
    return {
      key,
      contentType: metadata.contentType,
      contentLength: info.size,
      body: fs.stream(path.join(directory, bodyFileName)).pipe(
        Stream.mapError((cause) => storageError("read", key, cause)),
      ),
    }
  })

  const remove = Effect.fn("LocalObjectStorage.remove")(function*(rawKey: string) {
    const key = yield* validateKey(rawKey)
    const directory = objectDirectory(key)
    const exists = yield* fs.exists(directory).pipe(
      Effect.mapError((cause) => storageError("remove", key, cause)),
    )
    if (!exists) return yield* new ObjectNotFound({ key })
    yield* fs.remove(directory, { recursive: true }).pipe(
      Effect.mapError((cause) => storageError("remove", key, cause)),
    )
  })

  const verify = (token: string, operation: "upload" | "download") =>
    Effect.gen(function*() {
      const claims = yield* decodeClaims(token, options.signingSecret)
      if (claims.operation !== operation) return yield* new InvalidTransferToken()
      if (claims.expiresAt <= Date.now()) return yield* new ExpiredTransferToken()
      yield* validateKey(claims.key)
      return claims
    })

  const storage = ObjectStorage.of({
    put,
    get,
    remove,
    publicUrl: (rawKey) => validateKey(rawKey).pipe(
      Effect.map((key) => appendUrlPath(options.publicBaseUrl, publicPath, encodeKey(key))),
    ),
    createUploadTarget: (input) => validateKey(input.key).pipe(
      Effect.map((key) => {
        const expiresAt = new Date(Date.now() + input.expiresIn)
        const token = encodeClaims({
          version: 1,
          operation: "upload",
          key,
          expiresAt: expiresAt.getTime(),
          contentType: input.contentType,
          maxContentLength: input.maxContentLength,
        }, options.signingSecret)
        return {
          key,
          url: appendUrlPath(options.publicBaseUrl, `${transferPath}/upload`, token),
          method: "PUT" as const,
          headers: { "content-type": input.contentType },
          expiresAt,
        }
      }),
    ),
    createDownloadTarget: (input) => validateKey(input.key).pipe(
      Effect.map((key) => {
        const expiresAt = new Date(Date.now() + input.expiresIn)
        const token = encodeClaims({
          version: 1,
          operation: "download",
          key,
          expiresAt: expiresAt.getTime(),
        }, options.signingSecret)
        return {
          url: appendUrlPath(options.publicBaseUrl, `${transferPath}/download`, token),
          method: "GET" as const,
          headers: {},
          expiresAt,
        }
      }),
    ),
  })

  return Context.make(ObjectStorage, storage).pipe(
    Context.add(LocalObjectStorageTransfers, LocalObjectStorageTransfers.of({ verify })),
  )
}))
