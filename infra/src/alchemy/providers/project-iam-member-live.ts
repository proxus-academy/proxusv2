// @effect-diagnostics strictEffectProvide:off anyUnknownInErrorContext:off
import { getIamPolicyProjects, setIamPolicyProjects, type Policy } from "@distilled.cloud/gcp/cloudresourcemanager-v3"
import { Credentials, fromADC } from "@microagi/alchemy-gcp"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import type * as HttpClient from "effect/unstable/http/HttpClient"
import { ProjectIamClientError, type ProjectIamClient, type ProjectIamPolicy } from "./project-iam-member.ts"
import { sanitizedCloudError } from "./sanitized-cloud-error.ts"

export interface DistilledProjectIamOperations {
  readonly getPolicy: (request: { readonly resource: string; readonly body: { readonly options: { readonly requestedPolicyVersion: number } } }) => Effect.Effect<Policy, unknown>
  readonly setPolicy: (request: { readonly resource: string; readonly body: { readonly policy: Policy; readonly updateMask: string } }) => Effect.Effect<Policy, unknown>
}
export interface ProjectIamLiveOptions { readonly operations?: DistilledProjectIamOperations }

const code = (cause: unknown): ProjectIamClientError["code"] => {
  const d = sanitizedCloudError(cause); const tag = d.gcpCode ?? ""
  if (d.status === 404 || tag === "NotFound" || tag === "NOT_FOUND") return "not-found"
  if (d.status === 401 || d.status === 403 || tag === "Forbidden" || tag === "Unauthorized" || tag === "PERMISSION_DENIED") return "forbidden"
  if (d.status === 409 || d.status === 412 || tag === "Conflict" || tag === "ABORTED" || tag === "10") return "conflict"
  if (d.status === 400 || d.status === 422 || tag === "BadRequest" || tag === "UnprocessableEntity" || tag === "INVALID_ARGUMENT") return "invalid"
  return "unknown"
}
const policyOf = (policy: Policy): ProjectIamPolicy => ({
  ...(policy.etag === undefined ? {} : { etag: policy.etag }),
  ...(policy.version === undefined ? {} : { version: policy.version }),
  bindings: (policy.bindings ?? []).map((binding) => ({ role: binding.role ?? "", members: [...(binding.members ?? [])], ...(binding.condition === undefined ? {} : { condition: binding.condition }) })),
})
const live = Layer.merge(fromADC(), FetchHttpClient.layer)
const provide = <A, E>(effect: Effect.Effect<A, E, Credentials | HttpClient.HttpClient>) => effect.pipe(Effect.provide(live))
const distilled: DistilledProjectIamOperations = {
  getPolicy: (request) => provide(getIamPolicyProjects(request)),
  setPolicy: (request) => provide(setIamPolicyProjects(request)),
}

export const makeLiveProjectIamClient = ({ operations = distilled }: ProjectIamLiveOptions = {}): ProjectIamClient => {
  const map = <A>(operation: string, effect: Effect.Effect<A, unknown>) => effect.pipe(Effect.mapError((cause) => new ProjectIamClientError({ operation, code: code(cause), ...sanitizedCloudError(cause) })))
  return {
    getIamPolicy: (projectId) => map("get-project-iam-policy", operations.getPolicy({ resource: `projects/${projectId}`, body: { options: { requestedPolicyVersion: 3 } } })).pipe(Effect.map(policyOf)),
    setIamPolicy: (projectId, policy) => map("set-project-iam-policy", operations.setPolicy({ resource: `projects/${projectId}`, body: { policy: policy as Policy, updateMask: "bindings,etag,version" } })).pipe(Effect.asVoid),
  }
}
