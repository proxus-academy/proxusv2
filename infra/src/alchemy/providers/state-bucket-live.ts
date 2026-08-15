// @effect-diagnostics anyUnknownInErrorContext:off strictEffectProvide:off
import { getBuckets, insertBuckets, patchBuckets, type Bucket } from "@distilled.cloud/gcp/storage-v1"
import { Credentials, fromADC } from "@microagi/alchemy-gcp"
import { Effect, Layer } from "effect"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import type * as HttpClient from "effect/unstable/http/HttpClient"
import { StateBucketClientError, StateBucketProvider, type StateBucketClient, type StateBucketMetadata } from "./state-bucket.ts"

const live = Layer.merge(fromADC(), FetchHttpClient.layer)
const provide = <A, E>(effect: Effect.Effect<A, E, Credentials | HttpClient.HttpClient>) => effect.pipe(Effect.provide(live))
const error = (operation: string) => (cause: unknown) => { const tag = typeof cause === "object" && cause !== null && "_tag" in cause ? String(cause._tag) : ""; return new StateBucketClientError({ operation, code: tag === "NotFound" ? "not-found" : tag === "Conflict" ? "conflict" : "unknown" }) }
const metadata = (bucket: Bucket, project: string): StateBucketMetadata => ({ name: bucket.name ?? "", project, location: bucket.location ?? "", versioning: bucket.versioning?.enabled === true, uniformBucketLevelAccess: bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled === true, publicAccessPrevention: bucket.iamConfiguration?.publicAccessPrevention ?? "inherited" })
const makeLiveStateBucketClient = (project: string): StateBucketClient => ({
  get: (name) => provide(getBuckets({ bucket: name })).pipe(Effect.map((b) => metadata(b, project)), Effect.mapError(error("get-state-bucket"))),
  create: (props) => provide(insertBuckets({ project: props.project, body: { name: props.name, location: props.location, versioning: { enabled: true }, iamConfiguration: { uniformBucketLevelAccess: { enabled: true }, publicAccessPrevention: "enforced" } } })).pipe(Effect.map((b) => metadata(b, props.project)), Effect.mapError(error("create-state-bucket"))),
  patch: (name, p) => provide(patchBuckets({ bucket: name, body: { versioning: { enabled: p.versioning }, iamConfiguration: { uniformBucketLevelAccess: { enabled: p.uniformBucketLevelAccess }, publicAccessPrevention: p.publicAccessPrevention } } })).pipe(Effect.map((b) => metadata(b, project)), Effect.mapError(error("patch-state-bucket"))),
})
export const stateBucketLiveLayer = (project: string) => StateBucketProvider(makeLiveStateBucketClient(project))
