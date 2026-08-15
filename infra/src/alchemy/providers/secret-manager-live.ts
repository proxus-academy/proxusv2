// @effect-diagnostics strictBooleanExpressions:off anyUnknownInErrorContext:off strictEffectProvide:off
import {
  createProjectsSecrets,
  deleteProjectsSecrets,
  getIamPolicyProjectsSecrets,
  getProjectsSecrets,
  listProjectsSecrets,
  patchProjectsSecrets,
  setIamPolicyProjectsSecrets,
  type Policy,
  type Secret,
} from "@distilled.cloud/gcp/secretmanager-v1"
import { Credentials, fromADC } from "@microagi/alchemy-gcp"
import { Context, Effect, Layer } from "effect"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import type * as HttpClient from "effect/unstable/http/HttpClient"
import type { IamPolicy, SecretManagerClient, SecretMetadata } from "./secret-manager.ts"
import { SecretManagerClientError } from "./secret-manager.ts"
import { sanitizedCloudError } from "./sanitized-cloud-error.ts"

export interface DistilledSecretManagerOperations {
  readonly get: (request: { readonly name: string }) => Effect.Effect<Secret, unknown>
  readonly list: (request: { readonly parent: string; readonly pageToken?: string }) => Effect.Effect<{ readonly secrets?: ReadonlyArray<Secret>; readonly nextPageToken?: string }, unknown>
  readonly create: (request: { readonly parent: string; readonly secretId: string; readonly body: Secret }) => Effect.Effect<Secret, unknown>
  readonly update: (request: { readonly name: string; readonly updateMask: string; readonly body: Secret }) => Effect.Effect<Secret, unknown>
  readonly delete: (request: { readonly name: string; readonly etag?: string }) => Effect.Effect<unknown, unknown>
  readonly getPolicy: (request: { readonly resource: string; readonly "options.requestedPolicyVersion": number }) => Effect.Effect<Policy, unknown>
  readonly setPolicy: (request: { readonly resource: string; readonly body: { readonly policy: Policy; readonly updateMask: string } }) => Effect.Effect<Policy, unknown>
}

export interface SecretManagerLiveOptions {
  readonly project: string
  readonly operations?: DistilledSecretManagerOperations
}

export class SecretManagerLive extends Context.Service<SecretManagerLive, SecretManagerClient>()("@proxus/infra/alchemy/providers/secret-manager-live/SecretManagerLive") {}

const errorCode = (cause: unknown): SecretManagerClientError["code"] => {
  const d = sanitizedCloudError(cause); const tag = d.gcpCode ?? ""
  if (d.status === 404 || tag === "NotFound" || tag === "NOT_FOUND") return "not-found"
  if (d.status === 401 || d.status === 403 || tag === "Forbidden" || tag === "Unauthorized" || tag === "PERMISSION_DENIED") return "forbidden"
  if (d.status === 409 || d.status === 412 || tag === "Conflict" || tag === "ABORTED" || tag === "10") return "conflict"
  if (d.status === 400 || d.status === 422 || tag === "BadRequest" || tag === "UnprocessableEntity" || tag === "INVALID_ARGUMENT") return "invalid"
  return "unknown"
}
const normalize = (operation: string) => (cause: unknown) => new SecretManagerClientError({ operation, code: errorCode(cause), ...sanitizedCloudError(cause) })

const metadata = (value: Secret, operation: string, logicalProject?: string): Effect.Effect<SecretMetadata, SecretManagerClientError> =>
  Effect.try({
    try: () => {
      if (typeof value.name !== "string") throw new Error("missing name")
      const match = /^projects\/([^/]+)\/secrets\/([^/]+)$/.exec(value.name)
      if (!match?.[1] || !match[2]) throw new Error("invalid name")
      return {
        name: value.name,
        // GCP canonicalizes `name` with the numeric project number even when the
        // request used a project ID. Preserve the caller's logical identity.
        project: logicalProject ?? match[1],
        secretId: match[2],
        labels: { ...(value.labels ?? {}) },
        ...(value.createTime === undefined ? {} : { createTime: value.createTime }),
        ...(value.etag === undefined ? {} : { etag: value.etag }),
      }
    },
    catch: () => new SecretManagerClientError({ operation, code: "unknown" }),
  })

const toPolicy = (policy: Policy): IamPolicy => ({
  ...(policy.etag === undefined ? {} : { etag: policy.etag }),
  ...(policy.version === undefined ? {} : { version: policy.version }),
  bindings: (policy.bindings ?? []).map((binding) => ({
    role: binding.role ?? "",
    members: [...(binding.members ?? [])],
    ...(binding.condition === undefined ? {} : { condition: binding.condition }),
  })),
})

const distilledLive = Layer.merge(fromADC(), FetchHttpClient.layer)
const provideLive = <A, E>(effect: Effect.Effect<A, E, Credentials | HttpClient.HttpClient>) => effect.pipe(Effect.provide(distilledLive))

/** Real generated API operations using Alchemy's active GCP profile/ADC bridge. */
const distilledSecretManagerOperations: DistilledSecretManagerOperations = {
  get: (request) => provideLive(getProjectsSecrets(request)),
  list: (request) => provideLive(listProjectsSecrets(request)),
  create: (request) => provideLive(createProjectsSecrets(request)),
  update: (request) => provideLive(patchProjectsSecrets(request)),
  delete: (request) => provideLive(deleteProjectsSecrets(request)),
  getPolicy: (request) => provideLive(getIamPolicyProjectsSecrets(request)),
  setPolicy: (request) => provideLive(setIamPolicyProjectsSecrets(request)),
}

export const makeLiveSecretManagerClient = ({ project, operations = distilledSecretManagerOperations }: SecretManagerLiveOptions): SecretManagerClient => {
  const map = <A>(operation: string, effect: Effect.Effect<A, unknown>) => effect.pipe(Effect.mapError(normalize(operation)))
  const listPage = (pageToken?: string): Effect.Effect<ReadonlyArray<SecretMetadata>, SecretManagerClientError> =>
    map("list-secrets", operations.list({ parent: `projects/${project}`, ...(pageToken === undefined ? {} : { pageToken }) })).pipe(
      Effect.flatMap((page) => Effect.all((page.secrets ?? []).map((secret) => metadata(secret, "list-secrets", project))).pipe(
        Effect.flatMap((items) => page.nextPageToken === undefined ? Effect.succeed(items) : listPage(page.nextPageToken).pipe(Effect.map((rest) => [...items, ...rest]))),
      )),
    )
  return {
    getSecret: (name) => map("get-secret", operations.get({ name })).pipe(Effect.flatMap((secret) => metadata(secret, "get-secret", project))),
    listSecrets: () => listPage(),
    createSecret: (input) => map("create-secret", operations.create({ parent: `projects/${input.project}`, secretId: input.secretId, body: { labels: { ...input.labels }, replication: { automatic: {} } } })).pipe(Effect.flatMap((secret) => metadata(secret, "create-secret", input.project))),
    updateSecret: (input) => map("update-secret", operations.update({ name: input.name, updateMask: "labels", body: { name: input.name, labels: { ...input.labels }, ...(input.etag === undefined ? {} : { etag: input.etag }) } })).pipe(Effect.flatMap((secret) => metadata(secret, "update-secret", project))),
    deleteSecret: (name, etag) => map("delete-secret", operations.delete({ name, ...(etag === undefined ? {} : { etag }) })).pipe(Effect.asVoid),
    getIamPolicy: (name) => map("get-iam-policy", operations.getPolicy({ resource: name, "options.requestedPolicyVersion": 3 })).pipe(Effect.map(toPolicy)),
    setIamPolicy: (name, policy) => map("set-iam-policy", operations.setPolicy({ resource: name, body: { policy: { ...policy, bindings: policy.bindings.map((binding) => ({ ...binding, condition: binding.condition as Policy["bindings"] extends ReadonlyArray<infer B> ? B extends { condition?: infer C } ? C : never : never })) }, updateMask: "bindings,etag,version" } })).pipe(Effect.asVoid),
  }
}

export const secretManagerLiveLayer = (options: SecretManagerLiveOptions) =>
  Layer.succeed(SecretManagerLive, makeLiveSecretManagerClient(options))
