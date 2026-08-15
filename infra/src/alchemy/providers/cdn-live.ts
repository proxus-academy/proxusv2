// @effect-diagnostics strictBooleanExpressions:off anyUnknownInErrorContext:off strictEffectProvide:off
import { randomUUID } from "node:crypto"
import { deleteBackendBuckets, getBackendBuckets, getGlobalOperations, insertBackendBuckets, patchBackendBuckets, type BackendBucket, type Operation as ComputeOperation } from "@distilled.cloud/gcp/compute-v1"
import { generateServiceIdentityServices, getOperations, type Operation as UsageOperation } from "@distilled.cloud/gcp/unstable/serviceusage-v1beta1"
import { Credentials, fromADC } from "@microagi/alchemy-gcp"
import { Duration, Effect, Layer } from "effect"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import type * as HttpClient from "effect/unstable/http/HttpClient"
import { BackendBucketProvider, CdnClientError, ServiceIdentityProvider, type BackendBucketClient, type ServiceIdentityClient } from "./cdn.ts"

export interface DistilledCdnOperations {
  generateIdentity(request: { readonly parent: string }): Effect.Effect<UsageOperation, unknown>
  usageOperation(request: { readonly name: string }): Effect.Effect<UsageOperation, unknown>
  getBucket(request: { readonly project: string; readonly backendBucket: string }): Effect.Effect<BackendBucket, unknown>
  insertBucket(request: { readonly project: string; readonly requestId: string; readonly body: BackendBucket }): Effect.Effect<ComputeOperation, unknown>
  patchBucket(request: { readonly project: string; readonly backendBucket: string; readonly requestId: string; readonly body: BackendBucket }): Effect.Effect<ComputeOperation, unknown>
  deleteBucket(request: { readonly project: string; readonly backendBucket: string; readonly requestId: string }): Effect.Effect<ComputeOperation, unknown>
  computeOperation(request: { readonly project: string; readonly operation: string }): Effect.Effect<ComputeOperation, unknown>
  readonly sleep: Effect.Effect<void>
}
export interface CdnLiveOptions { readonly project: string; readonly operations?: DistilledCdnOperations; readonly maxOperationPolls?: number }
const live = Layer.merge(fromADC(), FetchHttpClient.layer)
const provide = <A, E>(e: Effect.Effect<A, E, Credentials | HttpClient.HttpClient>) => e.pipe(Effect.provide(live))
const distilledCdnOperations: DistilledCdnOperations = {
  generateIdentity: (r) => provide(generateServiceIdentityServices(r)), usageOperation: (r) => provide(getOperations(r)),
  getBucket: (r) => provide(getBackendBuckets(r)), insertBucket: (r) => provide(insertBackendBuckets(r)), patchBucket: (r) => provide(patchBackendBuckets(r)), deleteBucket: (r) => provide(deleteBackendBuckets(r)), computeOperation: (r) => provide(getGlobalOperations(r)), sleep: Effect.sleep(Duration.seconds(2)),
}
const code = (e: unknown): CdnClientError["code"] => { const t = typeof e === "object" && e !== null && "_tag" in e ? String(e._tag) : ""; return t === "NotFound" ? "not-found" : t === "Forbidden" || t === "Unauthorized" ? "forbidden" : t === "Conflict" ? "conflict" : t === "BadRequest" ? "invalid" : "unknown" }
const norm = (op: string) => (e: unknown) => e instanceof CdnClientError ? e : new CdnClientError({ operation: op, code: code(e) })
const responseEmail = (op: UsageOperation) => { const r = op.response as { readonly email?: string; readonly identity?: { readonly email?: string } } | undefined; return r?.email ?? r?.identity?.email }
export const makeLiveCdnClients = ({ operations = distilledCdnOperations, maxOperationPolls = 150 }: CdnLiveOptions): { identity: ServiceIdentityClient; bucket: BackendBucketClient } => {
  const map = <A>(op: string, e: Effect.Effect<A, unknown>) => e.pipe(Effect.mapError(norm(op)))
  const awaitUsage = (first: UsageOperation, n = 0): Effect.Effect<string, CdnClientError> => { const email = responseEmail(first); if (first.done === true) return first.error || !email ? Effect.fail(new CdnClientError({ operation: "service-identity", code: "operation-failed" })) : Effect.succeed(email); if (!first.name) return Effect.fail(new CdnClientError({ operation: "service-identity", code: "operation-failed" })); if (n >= maxOperationPolls) return Effect.fail(new CdnClientError({ operation: "service-identity", code: "timeout" })); return operations.sleep.pipe(Effect.flatMap(() => map("poll-service-identity", operations.usageOperation({ name: first.name! }))), Effect.flatMap((x) => awaitUsage(x, n + 1))) }
  const awaitCompute = (project: string, first: ComputeOperation, op: string, n = 0): Effect.Effect<void, CdnClientError> => { if (first.status === "DONE") return first.error === undefined ? Effect.void : Effect.fail(new CdnClientError({ operation: op, code: "operation-failed" })); if (!first.name) return Effect.fail(new CdnClientError({ operation: op, code: "operation-failed" })); if (n >= maxOperationPolls) return Effect.fail(new CdnClientError({ operation: op, code: "timeout" })); return operations.sleep.pipe(Effect.flatMap(() => map(op, operations.computeOperation({ project, operation: first.name! }))), Effect.flatMap((x) => awaitCompute(project, x, op, n + 1))) }
  const mutate = (project: string, name: string, op: string, call: (id: string) => Effect.Effect<ComputeOperation, unknown>) => { const id = randomUUID(); return map(op, call(id)).pipe(Effect.flatMap((x) => awaitCompute(project, x, op)), Effect.flatMap(() => map(`get-after-${op}`, operations.getBucket({ project, backendBucket: name })))) }
  return { identity: { getOrCreate: (project, service) => map("generate-service-identity", operations.generateIdentity({ parent: `projects/${project}/services/${service}` })).pipe(Effect.flatMap((x) => awaitUsage(x))) }, bucket: {
    get: (project, name) => map("get-backend-bucket", operations.getBucket({ project, backendBucket: name })),
    create: (project, body) => mutate(project, body.name!, "insert-backend-bucket", (requestId) => operations.insertBucket({ project, requestId, body })),
    patch: (project, name, body) => mutate(project, name, "patch-backend-bucket", (requestId) => operations.patchBucket({ project, backendBucket: name, requestId, body })),
    delete: (project, name) => { const requestId = randomUUID(); return map("delete-backend-bucket", operations.deleteBucket({ project, backendBucket: name, requestId })).pipe(Effect.flatMap((x) => awaitCompute(project, x, "delete-backend-bucket"))) },
  } }
}
export const cdnLiveLayer = (options: CdnLiveOptions) => { const c = makeLiveCdnClients(options); return Layer.merge(ServiceIdentityProvider(c.identity), BackendBucketProvider(c.bucket)) }
