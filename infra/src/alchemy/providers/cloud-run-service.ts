// @effect-diagnostics strictBooleanExpressions:off effectSucceedWithVoid:off
import type * as Run from "@distilled.cloud/gcp/run-v2"
import { createHash } from "node:crypto"
import { Resource } from "alchemy"
import { Unowned } from "alchemy/AdoptPolicy"
import { deepEqual, isResolved } from "alchemy/Diff"
import * as Provider from "alchemy/Provider"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import type { DependsOn } from "../resource-dependency.ts"

export class CloudRunServiceClientError extends Data.TaggedError("CloudRunServiceClientError")<{
  readonly operation: string
  readonly code: "not-found" | "forbidden" | "conflict" | "invalid" | "timeout" | "operation-failed" | "unknown"
  readonly status?: number
  readonly gcpCode?: string
  readonly message?: string
}> {}

export interface CloudRunServiceProps extends DependsOn {
  readonly project: string
  readonly location: string
  readonly name: string
  readonly labels?: Readonly<Record<string, string>>
  readonly iapEnabled: boolean
  /** Alchemy lifecycle guard. Cloud Run v2 has no deletion-protection field. */
  readonly deletionProtection: boolean
  readonly ingress?: "INGRESS_TRAFFIC_ALL" | "INGRESS_TRAFFIC_INTERNAL_ONLY" | "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER" | "INGRESS_TRAFFIC_NONE"
  readonly invokerIamDisabled: boolean
  readonly scaling?: Run.GoogleCloudRunV2ServiceScaling
  readonly template: Run.GoogleCloudRunV2RevisionTemplate
}

export interface CloudRunServiceAttributes extends CloudRunServiceProps {
  readonly resourceName: string
  readonly uid: string
  readonly uri: string
  readonly urls: ReadonlyArray<string>
  readonly etag?: string
}
export type CloudRunService = Resource<"Proxus.GCP.CloudRun.Service", CloudRunServiceProps, CloudRunServiceAttributes>
export const CloudRunService = Resource<CloudRunService>("Proxus.GCP.CloudRun.Service")

export interface CloudRunServiceClient {
  get(name: string): Effect.Effect<Run.GoogleCloudRunV2Service, CloudRunServiceClientError>
  list(parent: string): Effect.Effect<ReadonlyArray<Run.GoogleCloudRunV2Service>, CloudRunServiceClientError>
  create(parent: string, serviceId: string, body: Run.GoogleCloudRunV2Service): Effect.Effect<Run.GoogleCloudRunV2Service, CloudRunServiceClientError>
  patch(name: string, updateMask: string, body: Run.GoogleCloudRunV2Service): Effect.Effect<Run.GoogleCloudRunV2Service, CloudRunServiceClientError>
  delete(name: string, etag?: string): Effect.Effect<void, CloudRunServiceClientError>
}

const fqName = (p: Pick<CloudRunServiceProps, "project" | "location" | "name">) => `projects/${p.project}/locations/${p.location}/services/${p.name}`
const ownerLabelValue = (fqn: string) => {
  const normalized = fqn.toLowerCase().replace(/[^a-z0-9_-]/g, "-")
  if (normalized === fqn && normalized.length <= 63) return normalized
  const suffix = createHash("sha256").update(fqn).digest("hex").slice(0, 12)
  return `${normalized.slice(0, 50).replace(/[-_]+$/g, "")}-${suffix}`
}
const ownerLabel = (fqn: string) => ({ proxus_alchemy_fqn: ownerLabelValue(fqn) })
const missing = (error: CloudRunServiceClientError) => error.code === "not-found"
const observe = (client: CloudRunServiceClient, name: string) => client.get(name).pipe(Effect.catchIf(missing, () => Effect.succeed(undefined)))
const bodyOf = (props: CloudRunServiceProps, labels: Readonly<Record<string, string>>): Run.GoogleCloudRunV2Service => ({
  labels: { ...labels },
  iapEnabled: props.iapEnabled,
  invokerIamDisabled: props.invokerIamDisabled,
  ...(props.ingress === undefined ? {} : { ingress: props.ingress }),
  ...(props.scaling === undefined ? {} : { scaling: props.scaling }),
  template: props.template,
})
const attributes = (service: Run.GoogleCloudRunV2Service, props: CloudRunServiceProps): CloudRunServiceAttributes => ({
  project: props.project,
  location: props.location,
  name: props.name,
  iapEnabled: props.iapEnabled,
  deletionProtection: props.deletionProtection,
  invokerIamDisabled: props.invokerIamDisabled,
  ...(props.ingress === undefined ? {} : { ingress: props.ingress }),
  ...(props.scaling === undefined ? {} : { scaling: props.scaling }),
  template: props.template,
  labels: { ...(service.labels ?? {}) },
  resourceName: service.name ?? fqName(props),
  uid: service.uid ?? "",
  uri: service.uri ?? "",
  urls: [...(service.urls ?? [])],
  ...(service.etag === undefined ? {} : { etag: service.etag }),
})
const booleanSecurityField = (value: boolean | undefined) => value === true
// Cloud Run omits INGRESS_TRAFFIC_ALL from REST responses because it is the API default.
const ingressSecurityField = (value: Run.GoogleCloudRunV2Service["ingress"] | undefined) => value ?? "INGRESS_TRAFFIC_ALL"
const mutableFields = (current: Run.GoogleCloudRunV2Service, desired: Run.GoogleCloudRunV2Service) =>
  (["labels", "iapEnabled", "ingress", "invokerIamDisabled", "scaling", "template"] as const)
    .filter((field) => field === "iapEnabled" || field === "invokerIamDisabled"
      ? booleanSecurityField(current[field]) !== booleanSecurityField(desired[field])
      : field === "ingress"
        ? ingressSecurityField(current[field]) !== ingressSecurityField(desired[field])
        : !deepEqual(current[field], desired[field]))

export class CloudRunDeletionProtectedError extends Data.TaggedError("CloudRunDeletionProtectedError")<{
  readonly name: string
}> {}

export const makeCloudRunServiceProviderService = (client: CloudRunServiceClient) => CloudRunService.Provider.of({
  nuke: { skip: true },
  stables: ["project", "location", "name", "resourceName", "uid"],
  list: () => client.list("-").pipe(Effect.map((services) => services.flatMap((service) => {
    const match = /^projects\/([^/]+)\/locations\/([^/]+)\/services\/([^/]+)$/.exec(service.name ?? "")
    if (!match?.[1] || !match[2] || !match[3]) return []
    const props: CloudRunServiceProps = { project: match[1], location: match[2], name: match[3], labels: service.labels ?? {}, iapEnabled: service.iapEnabled === true, deletionProtection: true, invokerIamDisabled: service.invokerIamDisabled === true, ...(service.ingress === undefined ? {} : { ingress: service.ingress as NonNullable<CloudRunServiceProps["ingress"]> }), ...(service.scaling === undefined ? {} : { scaling: service.scaling }), template: service.template ?? {} }
    return [attributes(service, props)]
  }))),
  diff: ({ news, olds, output }) => !isResolved(news) ? Effect.void : Effect.succeed(
    (["project", "location", "name"] as const).some((key) => news[key] !== (output?.[key] ?? olds[key])) ? { action: "replace" as const } : undefined),
  read: ({ fqn, output, olds }) => {
    const project = output?.project ?? olds.project
    const location = output?.location ?? olds.location
    const name = output?.name ?? olds.name
    if (!project || !location || !name) return Effect.succeed(undefined)
    return observe(client, fqName({ project, location, name })).pipe(Effect.map((service) => {
      if (!service) return undefined
      const props: CloudRunServiceProps = {
        project, location, name,
        labels: service.labels ?? {},
        iapEnabled: service.iapEnabled === true,
        deletionProtection: output?.deletionProtection ?? olds.deletionProtection ?? true,
        invokerIamDisabled: service.invokerIamDisabled === true,
        ...(service.ingress === undefined ? {} : { ingress: service.ingress as NonNullable<CloudRunServiceProps["ingress"]> }),
        ...(service.scaling === undefined ? {} : { scaling: service.scaling }),
        template: service.template ?? {},
      }
      const result = attributes(service, props)
      return service.labels?.proxus_alchemy_fqn === ownerLabelValue(fqn) ? result : Unowned(result)
    }))
  },
  reconcile: ({ fqn, news }) => Effect.gen(function* () {
    const name = fqName(news)
    const labels = { ...(news.labels ?? {}), ...ownerLabel(fqn) }
    const desired = bodyOf(news, labels)
    let current = yield* observe(client, name)
    if (!current) current = yield* client.create(`projects/${news.project}/locations/${news.location}`, news.name, desired)
    const fields = mutableFields(current, desired)
    if (fields.length > 0) current = yield* client.patch(name, fields.join(","), { ...desired, ...(current.etag === undefined ? {} : { etag: current.etag }) })
    // Verify security-critical fields instead of trusting the mutation response.
    current = yield* client.get(name)
    // Cloud Run omits documented defaults from REST responses.
    if (booleanSecurityField(current.iapEnabled) !== news.iapEnabled
      || booleanSecurityField(current.invokerIamDisabled) !== news.invokerIamDisabled
      || ingressSecurityField(current.ingress) !== ingressSecurityField(news.ingress)) {
      return yield* new CloudRunServiceClientError({ operation: "verify-security-fields", code: "operation-failed" })
    }
    return attributes(current, { ...news, labels })
  }),
  delete: ({ output }) => output.deletionProtection
    ? Effect.fail(new CloudRunDeletionProtectedError({ name: output.resourceName }))
    : client.delete(output.resourceName, output.etag).pipe(Effect.catchIf(missing, () => Effect.void)),
})

export const CloudRunServiceProvider = (client: CloudRunServiceClient) => Provider.succeed(CloudRunService, makeCloudRunServiceProviderService(client))
