// @effect-diagnostics strictBooleanExpressions:off effectSucceedWithVoid:off
import { Unowned } from "alchemy/AdoptPolicy"
import { Resource } from "alchemy"
import { isResolved } from "alchemy/Diff"
import * as Provider from "alchemy/Provider"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"

export interface SourceFileDescriptor { readonly path: string; readonly sha256: string; readonly size: number }
export interface StorageObjectProps { readonly bucket: string; readonly name: string; readonly source: SourceFileDescriptor; readonly contentType: string; readonly cacheControl: string }
export interface StorageObjectMetadata { readonly bucket: string; readonly name: string; readonly sourceSha256?: string; readonly contentType?: string; readonly cacheControl?: string; readonly generation: string; readonly etag: string }
export type StorageObjectAttributes = StorageObjectProps & Pick<StorageObjectMetadata, "generation" | "etag">
export type StorageObject = Resource<"Proxus.GCP.StorageObject", StorageObjectProps, StorageObjectAttributes>
export const StorageObject = Resource<StorageObject>("Proxus.GCP.StorageObject")

export class StorageObjectClientError extends Data.TaggedError("StorageObjectClientError")<{ readonly operation: string; readonly code: "not-found" | "forbidden" | "conflict" | "foreign-bucket" | "invalid" | "unknown" }> {}
export interface StorageObjectClient {
  assertOwnedBucket(bucket: string): Effect.Effect<void, StorageObjectClientError>
  get(bucket: string, name: string): Effect.Effect<StorageObjectMetadata, StorageObjectClientError>
  list(): Effect.Effect<ReadonlyArray<StorageObjectMetadata>, StorageObjectClientError>
  upload(props: StorageObjectProps, expectedGeneration: string): Effect.Effect<StorageObjectMetadata, StorageObjectClientError>
  delete(bucket: string, name: string, generation: string): Effect.Effect<void, StorageObjectClientError>
}
const missing = (e: StorageObjectClientError) => e.code === "not-found"
const observe = (client: StorageObjectClient, bucket: string, name: string) => client.get(bucket, name).pipe(Effect.catchIf(missing, () => Effect.succeed(undefined)))
const attrs = (props: StorageObjectProps, value: StorageObjectMetadata): StorageObjectAttributes => ({ ...props, generation: value.generation, etag: value.etag })
const matches = (value: StorageObjectMetadata, props: StorageObjectProps) => value.sourceSha256 === props.source.sha256 && value.contentType === props.contentType && value.cacheControl === props.cacheControl

export const makeStorageObjectProviderService = (client: StorageObjectClient) => StorageObject.Provider.of({
  nuke: { skip: true }, stables: ["bucket", "name"],
  list: () => client.list().pipe(Effect.map((items) => items.filter((item) => item.sourceSha256 !== undefined).map((item) => ({ bucket: item.bucket, name: item.name, source: { path: "", sha256: item.sourceSha256!, size: 0 }, contentType: item.contentType ?? "application/octet-stream", cacheControl: item.cacheControl ?? "", generation: item.generation, etag: item.etag })))),
  diff: ({ news, olds, output }) => !isResolved(news) ? Effect.void : Effect.succeed((output?.bucket ?? olds.bucket) !== news.bucket || (output?.name ?? olds.name) !== news.name ? { action: "replace" } as const : undefined),
  read: ({ output, olds }) => Effect.gen(function* () {
    const bucket = output?.bucket ?? olds.bucket; const name = output?.name ?? olds.name
    if (!bucket || !name) return undefined
    yield* client.assertOwnedBucket(bucket)
    const value = yield* observe(client, bucket, name)
    if (!value) return undefined
    const desired = output ?? olds
    if (!desired.source || !matches(value, desired)) return Unowned(attrs(desired, value))
    return attrs(desired, value)
  }),
  reconcile: ({ news, output }) => Effect.gen(function* () {
    yield* client.assertOwnedBucket(news.bucket)
    const current = yield* observe(client, news.bucket, news.name)
    if (current && output === undefined && !matches(current, news)) return yield* new StorageObjectClientError({ operation: "adopt", code: "conflict" })
    if (current && matches(current, news)) return attrs(news, current)
    const uploaded = yield* client.upload(news, current?.generation ?? "0")
    if (!matches(uploaded, news) || !/^\d+$/.test(uploaded.generation) || uploaded.etag.length === 0) return yield* new StorageObjectClientError({ operation: "verify-upload", code: "unknown" })
    return attrs(news, uploaded)
  }),
  delete: ({ output }) => client.assertOwnedBucket(output.bucket).pipe(Effect.flatMap(() => client.delete(output.bucket, output.name, output.generation)), Effect.catchIf(missing, () => Effect.void)),
})
export const StorageObjectProvider = (client: StorageObjectClient) => Provider.succeed(StorageObject, makeStorageObjectProviderService(client))
