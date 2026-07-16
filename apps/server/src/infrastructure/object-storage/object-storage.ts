import { Context, Effect, Schema, Stream } from "effect"

export type ObjectKey = string & { readonly ObjectKey: unique symbol }

export class InvalidObjectKey extends Schema.TaggedErrorClass<InvalidObjectKey>()(
  "InvalidObjectKey",
  { key: Schema.String },
) {}

export class ObjectNotFound extends Schema.TaggedErrorClass<ObjectNotFound>()(
  "ObjectNotFound",
  { key: Schema.String },
) {}

export class ObjectAlreadyExists extends Schema.TaggedErrorClass<ObjectAlreadyExists>()(
  "ObjectAlreadyExists",
  { key: Schema.String },
) {}

export class ObjectStorageError extends Schema.TaggedErrorClass<ObjectStorageError>()(
  "ObjectStorageError",
  {
    operation: Schema.String,
    key: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export type ObjectStorageFailure =
  | InvalidObjectKey
  | ObjectNotFound
  | ObjectAlreadyExists
  | ObjectStorageError

export interface StoredObject {
  readonly key: ObjectKey
  readonly contentType: string
  readonly contentLength: bigint
  readonly body: Stream.Stream<Uint8Array, ObjectStorageError>
}

export interface UploadTarget {
  readonly key: ObjectKey
  readonly url: string
  readonly method: "PUT"
  readonly headers: Readonly<Record<string, string>>
  readonly expiresAt: Date
}

export interface DownloadTarget {
  readonly url: string
  readonly method: "GET"
  readonly headers: Readonly<Record<string, string>>
  readonly expiresAt?: Date
}

export interface PutObjectInput {
  readonly key: string
  readonly contentType: string
  readonly body: Stream.Stream<Uint8Array, ObjectStorageError>
}

export interface CreateUploadTargetInput {
  readonly key: string
  readonly contentType: string
  readonly maxContentLength: number
  readonly expiresIn: number
}

export interface CreateDownloadTargetInput {
  readonly key: string
  readonly expiresIn: number
}

export class ObjectStorage extends Context.Service<
  ObjectStorage,
  {
    readonly put: (
      input: PutObjectInput,
    ) => Effect.Effect<ObjectKey, ObjectStorageFailure>
    readonly get: (
      key: string,
    ) => Effect.Effect<StoredObject, ObjectStorageFailure>
    readonly remove: (
      key: string,
    ) => Effect.Effect<void, ObjectStorageFailure>
    readonly publicUrl: (
      key: string,
    ) => Effect.Effect<string, InvalidObjectKey>
    readonly createUploadTarget: (
      input: CreateUploadTargetInput,
    ) => Effect.Effect<UploadTarget, InvalidObjectKey | ObjectStorageError>
    readonly createDownloadTarget: (
      input: CreateDownloadTargetInput,
    ) => Effect.Effect<DownloadTarget, InvalidObjectKey | ObjectStorageError>
  }
>()("@proxus/server/infrastructure/object-storage/object-storage/ObjectStorage") {}
