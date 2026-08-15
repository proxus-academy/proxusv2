// @effect-diagnostics strictBooleanExpressions:off effectSucceedWithVoid:off
import { Resource } from "alchemy"
import { Unowned } from "alchemy/AdoptPolicy"
import { deepEqual, isResolved } from "alchemy/Diff"
import * as Provider from "alchemy/Provider"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import type { BackendBucket as ApiBackendBucket, BackendBucketCdnPolicy } from "@distilled.cloud/gcp/compute-v1"

export class CdnClientError extends Data.TaggedError("CdnClientError")<{ readonly operation: string; readonly code: "not-found" | "forbidden" | "conflict" | "invalid" | "timeout" | "operation-failed" | "unknown" }> {}

interface ServiceIdentityProps { readonly project: string; readonly service: "cloudcdn.googleapis.com" }
interface ServiceIdentityAttributes extends ServiceIdentityProps { readonly email: string; readonly member: string }
export type ServiceIdentity = Resource<"Proxus.GCP.ServiceIdentity", ServiceIdentityProps, ServiceIdentityAttributes>
export const ServiceIdentity = Resource<ServiceIdentity>("Proxus.GCP.ServiceIdentity")
export interface ServiceIdentityClient { getOrCreate(project: string, service: string): Effect.Effect<string, CdnClientError> }

const makeServiceIdentityProviderService = (client: ServiceIdentityClient) => ServiceIdentity.Provider.of({
  nuke: { skip: true }, stables: ["project", "service", "email", "member"], list: () => Effect.succeed([]),
  diff: ({ news, olds, output }) => !isResolved(news) ? Effect.void : Effect.succeed(news.project !== (output?.project ?? olds.project) || news.service !== (output?.service ?? olds.service) ? { action: "replace" } as const : undefined),
  read: ({ output, olds }) => {
    const project = output?.project ?? olds.project; const service = output?.service ?? olds.service
    if (!project || !service) return Effect.succeed(undefined)
    return client.getOrCreate(project, service).pipe(Effect.map((email) => ({ project, service, email, member: `serviceAccount:${email}` })))
  },
  reconcile: ({ news }) => client.getOrCreate(news.project, news.service).pipe(Effect.map((email) => ({ ...news, email, member: `serviceAccount:${email}` }))),
  // Service identities are Google-managed and must never be deleted by the stack.
  delete: () => Effect.void,
})
export const ServiceIdentityProvider = (client: ServiceIdentityClient) => Provider.succeed(ServiceIdentity, makeServiceIdentityProviderService(client))

interface BackendBucketProps { readonly project: string; readonly name: string; readonly bucketName: string; readonly description?: string; readonly deletionProtection: boolean }
interface BackendBucketAttributes extends BackendBucketProps { readonly id: string; readonly selfLink: string }
export type BackendBucket = Resource<"Proxus.GCP.Compute.BackendBucket", BackendBucketProps, BackendBucketAttributes>
export const BackendBucket = Resource<BackendBucket>("Proxus.GCP.Compute.BackendBucket")
export interface BackendBucketClient {
  get(project: string, name: string): Effect.Effect<ApiBackendBucket, CdnClientError>
  create(project: string, body: ApiBackendBucket): Effect.Effect<ApiBackendBucket, CdnClientError>
  patch(project: string, name: string, body: ApiBackendBucket): Effect.Effect<ApiBackendBucket, CdnClientError>
  delete(project: string, name: string): Effect.Effect<void, CdnClientError>
}
export const productionCdnPolicy: BackendBucketCdnPolicy = { cacheMode: "USE_ORIGIN_HEADERS", negativeCaching: true, serveWhileStale: 86400 }
const desired = (p: BackendBucketProps): ApiBackendBucket => ({ name: p.name, bucketName: p.bucketName, ...(p.description === undefined ? {} : { description: p.description }), enableCdn: true, compressionMode: "AUTOMATIC", cdnPolicy: productionCdnPolicy })
const missing = (e: CdnClientError) => e.code === "not-found"
const observe = (c: BackendBucketClient, p: string, n: string) => c.get(p, n).pipe(Effect.catchIf(missing, () => Effect.succeed(undefined)))
const secure = (v: ApiBackendBucket, p: BackendBucketProps) => v.bucketName === p.bucketName && v.enableCdn === true && v.compressionMode === "AUTOMATIC" && deepEqual(v.cdnPolicy, productionCdnPolicy)
const attrs = (v: ApiBackendBucket, p: BackendBucketProps): BackendBucketAttributes => ({ ...p, id: v.id ?? "", selfLink: v.selfLink ?? "" })
class BackendBucketDeletionProtectedError extends Data.TaggedError("BackendBucketDeletionProtectedError")<{ readonly name: string }> {}
const makeBackendBucketProviderService = (client: BackendBucketClient) => BackendBucket.Provider.of({
  nuke: { skip: true }, stables: ["project", "name", "bucketName", "id"], list: () => Effect.succeed([]),
  diff: ({ news, olds, output }) => !isResolved(news) ? Effect.void : Effect.succeed(news.project !== (output?.project ?? olds.project) || news.name !== (output?.name ?? olds.name) || news.bucketName !== (output?.bucketName ?? olds.bucketName) ? { action: "replace" } as const : undefined),
  read: ({ output, olds }) => { const p = output ?? olds; if (!p.project || !p.name) return Effect.succeed(undefined); return observe(client, p.project, p.name).pipe(Effect.map((v) => !v ? undefined : secure(v, p as BackendBucketProps) ? attrs(v, p as BackendBucketProps) : Unowned(attrs(v, p as BackendBucketProps)))) },
  reconcile: ({ news, output }) => Effect.gen(function* () {
    let current = yield* observe(client, news.project, news.name)
    if (current && output === undefined && !secure(current, news)) return yield* new CdnClientError({ operation: "adopt", code: "conflict" })
    if (!current) current = yield* client.create(news.project, desired(news))
    else if (!secure(current, news) || current.description !== news.description) current = yield* client.patch(news.project, news.name, desired(news))
    current = yield* client.get(news.project, news.name)
    if (!secure(current, news)) return yield* new CdnClientError({ operation: "verify-cdn-policy", code: "operation-failed" })
    return attrs(current, news)
  }),
  delete: ({ output }) => output.deletionProtection ? Effect.fail(new BackendBucketDeletionProtectedError({ name: output.name })) : client.delete(output.project, output.name).pipe(Effect.catchIf(missing, () => Effect.void)),
})
export const BackendBucketProvider = (client: BackendBucketClient) => Provider.succeed(BackendBucket, makeBackendBucketProviderService(client))
