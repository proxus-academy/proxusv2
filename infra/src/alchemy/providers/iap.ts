// @effect-diagnostics strictBooleanExpressions:off effectSucceedWithVoid:off
import { isIapAccessPrincipal, type IapAccessPrincipal } from "../iap-access-principal.ts"
import { Resource } from "alchemy"
import { isResolved } from "alchemy/Diff"
import * as Provider from "alchemy/Provider"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"

export class IapClientError extends Data.TaggedError("IapClientError")<{
  readonly operation: string
  readonly code: "not-found" | "forbidden" | "conflict" | "invalid" | "unknown"
}> {}

export class IapPrincipalError extends Data.TaggedError("IapPrincipalError")<{
  readonly principal: string
  readonly expected: "iap-service-agent" | "iap-access-principal"
}> {}

export interface IapIamPolicy {
  readonly etag?: string
  readonly version?: number
  readonly bindings: ReadonlyArray<{
    readonly role: string
    readonly members: ReadonlyArray<string>
    readonly condition?: unknown
  }>
}

/** The two policy surfaces deliberately have separate methods: their REST resources differ. */
export interface IapClient {
  listCloudRunServices(): Effect.Effect<ReadonlyArray<string>, IapClientError>
  getCloudRunIamPolicy(service: string): Effect.Effect<IapIamPolicy, IapClientError>
  setCloudRunIamPolicy(service: string, policy: IapIamPolicy): Effect.Effect<void, IapClientError>
  listIapCloudRunServices(): Effect.Effect<ReadonlyArray<string>, IapClientError>
  getIapIamPolicy(service: string): Effect.Effect<IapIamPolicy, IapClientError>
  setIapIamPolicy(service: string, policy: IapIamPolicy): Effect.Effect<void, IapClientError>
}

interface CloudRunIapInvokerProps {
  /** Canonical Cloud Run name: projects/{project}/locations/{location}/services/{service}. */
  readonly service: string
  readonly projectNumber: string
}
interface CloudRunIapInvokerAttributes extends CloudRunIapInvokerProps {
  readonly member: string
  readonly role: "roles/run.invoker"
}
export type CloudRunIapInvoker = Resource<"Proxus.GCP.IAP.CloudRunInvoker", CloudRunIapInvokerProps, CloudRunIapInvokerAttributes>
export const CloudRunIapInvoker = Resource<CloudRunIapInvoker>("Proxus.GCP.IAP.CloudRunInvoker")

interface IapCloudRunAccessProps {
  readonly service: string
  readonly member: IapAccessPrincipal
}
interface IapCloudRunAccessAttributes extends IapCloudRunAccessProps {
  readonly role: "roles/iap.httpsResourceAccessor"
}
export type IapCloudRunAccess = Resource<"Proxus.GCP.IAP.CloudRunAccess", IapCloudRunAccessProps, IapCloudRunAccessAttributes>
export const IapCloudRunAccess = Resource<IapCloudRunAccess>("Proxus.GCP.IAP.CloudRunAccess")

const missing = (error: IapClientError) => error.code === "not-found"
const unconditional = (binding: IapIamPolicy["bindings"][number]) => binding.condition === undefined
const has = (policy: IapIamPolicy, role: string, member: string) =>
  policy.bindings.some((binding) => binding.role === role && unconditional(binding) && binding.members.includes(member))

const serviceAgent = (projectNumber: string) => `serviceAccount:service-${projectNumber}@gcp-sa-iap.iam.gserviceaccount.com`
const validateServiceAgent = (projectNumber: string): Effect.Effect<string, IapPrincipalError> => {
  const member = serviceAgent(projectNumber)
  return /^serviceAccount:service-[0-9]+@gcp-sa-iap\.iam\.gserviceaccount\.com$/.test(member)
    ? Effect.succeed(member)
    : Effect.fail(new IapPrincipalError({ principal: member, expected: "iap-service-agent" }))
}
const validateAccessPrincipal = (member: string): Effect.Effect<IapAccessPrincipal, IapPrincipalError> =>
  isIapAccessPrincipal(member)
    ? Effect.succeed(member)
    : Effect.fail(new IapPrincipalError({ principal: member, expected: "iap-access-principal" }))

const add = (policy: IapIamPolicy, role: string, member: string): IapIamPolicy => {
  const bindings = policy.bindings.map((binding) => ({ ...binding, members: [...binding.members] }))
  const binding = bindings.find((candidate) => candidate.role === role && unconditional(candidate))
  if (binding) binding.members = [...binding.members, member]
  else bindings.push({ role, members: [member] })
  return { ...policy, version: Math.max(policy.version ?? 0, 3), bindings }
}
const remove = (policy: IapIamPolicy, role: string, member: string): IapIamPolicy => ({
  ...policy,
  bindings: policy.bindings
    .map((binding) => binding.role === role && unconditional(binding)
      ? { ...binding, members: binding.members.filter((candidate) => candidate !== member) }
      : { ...binding, members: [...binding.members] })
    .filter((binding) => binding.members.length > 0),
})

const invokerRole = "roles/run.invoker" as const
const accessRole = "roles/iap.httpsResourceAccessor" as const

export const makeCloudRunIapInvokerProviderService = (client: IapClient) => CloudRunIapInvoker.Provider.of({
  nuke: { skip: true },
  stables: ["service", "projectNumber", "member", "role"],
  list: () => client.listCloudRunServices().pipe(Effect.flatMap((services) => Effect.all(services.map((service) =>
    client.getCloudRunIamPolicy(service).pipe(
      Effect.map((policy) => policy.bindings.flatMap((binding) => binding.role === invokerRole && unconditional(binding)
        ? binding.members.flatMap((member) => {
          const match = /^serviceAccount:service-([0-9]+)@gcp-sa-iap\.iam\.gserviceaccount\.com$/.exec(member)
          return match ? [{ service, projectNumber: match[1]!, member, role: invokerRole }] : []
        }) : [])),
      Effect.catchIf(missing, () => Effect.succeed([])),
    )))), Effect.map((groups) => groups.flat())),
  diff: ({ news, olds, output }) => !isResolved(news) ? Effect.void : Effect.succeed(
    news.service !== (output?.service ?? olds.service) || news.projectNumber !== (output?.projectNumber ?? olds.projectNumber)
      ? { action: "replace" as const } : undefined),
  read: ({ output, olds }) => {
    const service = output?.service ?? olds.service
    const projectNumber = output?.projectNumber ?? olds.projectNumber
    if (!service || !projectNumber) return Effect.succeed(undefined)
    return validateServiceAgent(projectNumber).pipe(Effect.flatMap((member) => client.getCloudRunIamPolicy(service).pipe(
      Effect.map((policy) => has(policy, invokerRole, member) ? { service, projectNumber, member, role: invokerRole } : undefined),
      Effect.catchIf(missing, () => Effect.succeed(undefined)))))
  },
  reconcile: ({ news }) => Effect.gen(function* () {
    const member = yield* validateServiceAgent(news.projectNumber)
    const policy = yield* client.getCloudRunIamPolicy(news.service)
    if (!has(policy, invokerRole, member)) yield* client.setCloudRunIamPolicy(news.service, add(policy, invokerRole, member))
    return { ...news, member, role: invokerRole }
  }),
  delete: ({ output }) => client.getCloudRunIamPolicy(output.service).pipe(
    Effect.flatMap((policy) => has(policy, invokerRole, output.member)
      ? client.setCloudRunIamPolicy(output.service, remove(policy, invokerRole, output.member)) : Effect.void),
    Effect.catchIf((error) => error.code === "not-found", () => Effect.void)),
})

export const makeIapCloudRunAccessProviderService = (client: IapClient) => IapCloudRunAccess.Provider.of({
  nuke: { skip: true },
  stables: ["service", "member", "role"],
  list: () => client.listIapCloudRunServices().pipe(Effect.flatMap((services) => Effect.all(services.map((service) =>
    client.getIapIamPolicy(service).pipe(
      Effect.map((policy) => policy.bindings.flatMap((binding) => binding.role === accessRole && unconditional(binding)
        ? binding.members.flatMap((member) => isIapAccessPrincipal(member)
          ? [{ service, member, role: accessRole }] : []) : [])),
      Effect.catchIf(missing, () => Effect.succeed([])),
    )))), Effect.map((groups) => groups.flat())),
  diff: ({ news, olds, output }) => !isResolved(news) ? Effect.void : Effect.succeed(
    news.service !== (output?.service ?? olds.service) || news.member !== (output?.member ?? olds.member)
      ? { action: "replace" as const } : undefined),
  read: ({ output, olds }) => {
    const service = output?.service ?? olds.service
    const candidate = output?.member ?? olds.member
    if (!service || !candidate) return Effect.succeed(undefined)
    return validateAccessPrincipal(candidate).pipe(Effect.flatMap((member) => client.getIapIamPolicy(service).pipe(
      Effect.map((policy) => has(policy, accessRole, member) ? { service, member, role: accessRole } : undefined),
      Effect.catchIf(missing, () => Effect.succeed(undefined)))))
  },
  reconcile: ({ news }) => Effect.gen(function* () {
    const member = yield* validateAccessPrincipal(news.member)
    const policy = yield* client.getIapIamPolicy(news.service)
    if (!has(policy, accessRole, member)) yield* client.setIapIamPolicy(news.service, add(policy, accessRole, member))
    return { service: news.service, member, role: accessRole }
  }),
  delete: ({ output }) => client.getIapIamPolicy(output.service).pipe(
    Effect.flatMap((policy) => has(policy, accessRole, output.member)
      ? client.setIapIamPolicy(output.service, remove(policy, accessRole, output.member)) : Effect.void),
    Effect.catchIf((error) => error.code === "not-found", () => Effect.void)),
})

export const CloudRunIapInvokerProvider = (client: IapClient) => Provider.succeed(CloudRunIapInvoker, makeCloudRunIapInvokerProviderService(client))
export const IapCloudRunAccessProvider = (client: IapClient) => Provider.succeed(IapCloudRunAccess, makeIapCloudRunAccessProviderService(client))
