// @effect-diagnostics strictBooleanExpressions:off effectSucceedWithVoid:off
import { Resource } from "alchemy"
import { isResolved } from "alchemy/Diff"
import * as Provider from "alchemy/Provider"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"

export interface StateBucketMetadata { readonly name: string; readonly project: string; readonly location: string; readonly versioning: boolean; readonly uniformBucketLevelAccess: boolean; readonly publicAccessPrevention: string }
export class StateBucketClientError extends Data.TaggedError("StateBucketClientError")<{ readonly operation: string; readonly code: "not-found" | "conflict" | "unknown" }> {}
export interface StateBucketClient {
  get(name: string): Effect.Effect<StateBucketMetadata, StateBucketClientError>
  create(props: StateBucketProps): Effect.Effect<StateBucketMetadata, StateBucketClientError>
  patch(name: string, protections: Pick<StateBucketMetadata, "versioning" | "uniformBucketLevelAccess" | "publicAccessPrevention">): Effect.Effect<StateBucketMetadata, StateBucketClientError>
}
interface StateBucketProps { readonly project: string; readonly name: string; readonly location: string; readonly deletionProtection?: boolean }
type StateBucketAttributes = StateBucketMetadata & { readonly deletionProtection: boolean }
export type StateBucket = Resource<"Proxus.GCP.StateBucket", StateBucketProps, StateBucketAttributes>
export const StateBucket = Resource<StateBucket>("Proxus.GCP.StateBucket")
export class StateBucketDeletionProtectedError extends Data.TaggedError("StateBucketDeletionProtectedError")<{ readonly name: string }> {}
const protections = { versioning: true, uniformBucketLevelAccess: true, publicAccessPrevention: "enforced" as const }
const sameLocation = (left: string, right: string) => left.toLowerCase() === right.toLowerCase()
const observe = (client: StateBucketClient, name: string) => client.get(name).pipe(Effect.catchIf((e) => e.code === "not-found", () => Effect.succeed(undefined)))
export const makeStateBucketProviderService = (client: StateBucketClient) => StateBucket.Provider.of({
  stables: ["name", "project", "location"], list: () => Effect.succeed([]),
  diff: ({ news, olds, output }) => !isResolved(news) ? Effect.void : Effect.succeed(
    (output?.name ?? olds.name) !== news.name ||
    (output?.project ?? olds.project) !== news.project ||
    !sameLocation(output?.location ?? olds.location, news.location)
      ? { action: "replace" } as const
      : undefined,
  ),
  read: ({ output, olds }) => { const name = output?.name ?? olds.name; return name ? observe(client, name).pipe(Effect.map((v) => v && ({ ...v, deletionProtection: output?.deletionProtection ?? olds.deletionProtection ?? true }))) : Effect.succeed(undefined) },
  reconcile: ({ news }) => Effect.gen(function* () {
    let current = yield* observe(client, news.name)
    if (!current) current = yield* client.create(news).pipe(Effect.catchIf((e) => e.code === "conflict", () => client.get(news.name)))
    if (current.project !== news.project || !sameLocation(current.location, news.location)) return yield* new StateBucketClientError({ operation: "adopt", code: "conflict" })
    if (!current.versioning || !current.uniformBucketLevelAccess || current.publicAccessPrevention !== "enforced") current = yield* client.patch(news.name, protections)
    return { ...current, deletionProtection: news.deletionProtection ?? true }
  }),
  // Bootstrap state may be discarded or re-adopted, but the physical bucket is never deleted.
  delete: ({ output }) => output.deletionProtection ? Effect.fail(new StateBucketDeletionProtectedError({ name: output.name })) : Effect.void,
})
export const StateBucketProvider = (client: StateBucketClient) => Provider.succeed(StateBucket, makeStateBucketProviderService(client))
