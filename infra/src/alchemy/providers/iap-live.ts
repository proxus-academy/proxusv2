// @effect-diagnostics strictBooleanExpressions:off anyUnknownInErrorContext:off strictEffectProvide:off
import {
  getIamPolicyProjectsLocationsServices,
  listProjectsLocationsServices,
  setIamPolicyProjectsLocationsServices,
  type GoogleIamV1Policy,
} from "@distilled.cloud/gcp/run-v2"
import {
  getIamPolicyV1,
  setIamPolicyV1,
  type Policy,
} from "@distilled.cloud/gcp/iap-v1"
import { Credentials, fromADC } from "@microagi/alchemy-gcp"
import { Context, Effect, Layer } from "effect"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import type * as HttpClient from "effect/unstable/http/HttpClient"
import {
  CloudRunIapInvokerProvider,
  IapClientError,
  IapCloudRunAccessProvider,
  type IapClient,
  type IapIamPolicy,
} from "./iap.ts"

interface PolicyLike {
  readonly etag?: string
  readonly version?: number
  readonly bindings?: ReadonlyArray<{ readonly role?: string; readonly members?: ReadonlyArray<string>; readonly condition?: unknown }>
}

export interface DistilledIapOperations {
  readonly listRunServices: (request: { readonly parent: string; readonly pageToken?: string }) => Effect.Effect<{ readonly services?: ReadonlyArray<{ readonly name?: string }>; readonly nextPageToken?: string }, unknown>
  readonly getRunPolicy: (request: { readonly resource: string; readonly "options.requestedPolicyVersion": number }) => Effect.Effect<PolicyLike, unknown>
  readonly setRunPolicy: (request: { readonly resource: string; readonly body: { readonly policy: GoogleIamV1Policy; readonly updateMask: string } }) => Effect.Effect<unknown, unknown>
  readonly getIapPolicy: (request: { readonly resource: string; readonly body: { readonly options: { readonly requestedPolicyVersion: number } } }) => Effect.Effect<PolicyLike, unknown>
  readonly setIapPolicy: (request: { readonly resource: string; readonly body: { readonly policy: Policy; readonly updateMask: string } }) => Effect.Effect<unknown, unknown>
}

export interface IapLiveOptions {
  readonly project: string
  readonly location: string
  readonly operations?: DistilledIapOperations
}

export class IapLive extends Context.Service<IapLive, IapClient>()("@proxus/infra/alchemy/providers/iap-live/IapLive") {}

const errorCode = (cause: unknown): IapClientError["code"] => {
  const tag = typeof cause === "object" && cause !== null && "_tag" in cause ? String(cause._tag) : ""
  if (tag === "NotFound") return "not-found"
  if (tag === "Forbidden" || tag === "Unauthorized") return "forbidden"
  if (tag === "Conflict") return "conflict"
  if (tag === "BadRequest" || tag === "UnprocessableEntity") return "invalid"
  return "unknown"
}
const normalize = (operation: string) => (cause: unknown) => new IapClientError({ operation, code: errorCode(cause) })

const distilledLive = Layer.merge(fromADC(), FetchHttpClient.layer)
const provideLive = <A, E>(effect: Effect.Effect<A, E, Credentials | HttpClient.HttpClient>) => effect.pipe(Effect.provide(distilledLive))

const distilledIapOperations: DistilledIapOperations = {
  listRunServices: (request) => provideLive(listProjectsLocationsServices(request)),
  getRunPolicy: (request) => provideLive(getIamPolicyProjectsLocationsServices(request)),
  setRunPolicy: (request) => provideLive(setIamPolicyProjectsLocationsServices(request)),
  getIapPolicy: (request) => provideLive(getIamPolicyV1(request)),
  setIapPolicy: (request) => provideLive(setIamPolicyV1(request)),
}

const policyOf = (policy: PolicyLike): IapIamPolicy => ({
  ...(policy.etag === undefined ? {} : { etag: policy.etag }),
  version: 3,
  bindings: (policy.bindings ?? []).map((binding) => ({
    role: binding.role ?? "",
    members: [...(binding.members ?? [])],
    ...(binding.condition === undefined ? {} : { condition: binding.condition }),
  })),
})

const apiPolicy = (policy: IapIamPolicy) => ({
  ...policy,
  version: 3,
  bindings: policy.bindings.map((binding) => ({ ...binding, condition: binding.condition as never })),
})

const iapResource = (service: string): Effect.Effect<string, IapClientError> => Effect.try({
  try: () => {
    const match = /^projects\/([^/]+)\/locations\/([^/]+)\/services\/([^/]+)$/.exec(service)
    if (!match?.[1] || !match[2] || !match[3]) throw new Error("invalid service")
    return `projects/${match[1]}/iap_web/cloud_run-${match[2]}/services/${match[3]}`
  },
  catch: () => new IapClientError({ operation: "parse-service", code: "invalid" }),
})

export const makeLiveIapClient = ({ project, location, operations = distilledIapOperations }: IapLiveOptions): IapClient => {
  const map = <A>(operation: string, effect: Effect.Effect<A, unknown>) => effect.pipe(Effect.mapError(normalize(operation)))
  const listPage = (pageToken?: string): Effect.Effect<ReadonlyArray<string>, IapClientError> =>
    map("list-cloud-run-services", operations.listRunServices({ parent: `projects/${project}/locations/${location}`, ...(pageToken === undefined ? {} : { pageToken }) })).pipe(
      Effect.flatMap((page) => {
        const names = (page.services ?? []).flatMap(({ name }) => name === undefined ? [] : [name])
        return page.nextPageToken === undefined ? Effect.succeed(names) : listPage(page.nextPageToken).pipe(Effect.map((rest) => [...names, ...rest]))
      }),
    )
  const getIap = (service: string) => iapResource(service).pipe(Effect.flatMap((resource) => map("get-iap-iam-policy", operations.getIapPolicy({ resource, body: { options: { requestedPolicyVersion: 3 } } }))), Effect.map(policyOf))
  return {
    listCloudRunServices: () => listPage(),
    getCloudRunIamPolicy: (service) => map("get-cloud-run-iam-policy", operations.getRunPolicy({ resource: service, "options.requestedPolicyVersion": 3 })).pipe(Effect.map(policyOf)),
    setCloudRunIamPolicy: (service, policy) => map("set-cloud-run-iam-policy", operations.setRunPolicy({ resource: service, body: { policy: apiPolicy(policy), updateMask: "bindings,etag,version" } })).pipe(Effect.asVoid),
    listIapCloudRunServices: () => listPage(),
    getIapIamPolicy: getIap,
    setIapIamPolicy: (service, policy) => iapResource(service).pipe(Effect.flatMap((resource) => map("set-iap-iam-policy", operations.setIapPolicy({ resource, body: { policy: apiPolicy(policy), updateMask: "bindings,etag,version" } }))), Effect.asVoid),
  }
}

export const iapLiveLayer = (options: IapLiveOptions) => Layer.succeed(IapLive, makeLiveIapClient(options))
export const cloudRunIapInvokerLiveLayer = (options: IapLiveOptions) => CloudRunIapInvokerProvider(makeLiveIapClient(options))
export const iapCloudRunAccessLiveLayer = (options: IapLiveOptions) => IapCloudRunAccessProvider(makeLiveIapClient(options))
