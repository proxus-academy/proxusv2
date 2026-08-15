// @effect-diagnostics strictBooleanExpressions:off anyUnknownInErrorContext:off strictEffectProvide:off
import {
  getDatasets,
  listDatasets,
  patchDatasets,
  type Dataset,
} from "@distilled.cloud/gcp/bigquery-v2"
import { Credentials, fromADC } from "@microagi/alchemy-gcp"
import { Context, Effect, Layer } from "effect"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import type * as HttpClient from "effect/unstable/http/HttpClient"
import { BigQueryClientError, type BigQueryIamClient, type BigQueryIamPolicy } from "./bigquery.ts"
import { sanitizedCloudError } from "./sanitized-cloud-error.ts"

type Access = NonNullable<Dataset["access"]>[number]

export interface DistilledBigQueryOperations {
  readonly list: (request: { readonly projectId: string; readonly pageToken?: string }) => Effect.Effect<{ readonly datasets?: ReadonlyArray<{ readonly datasetReference?: { readonly projectId?: string; readonly datasetId?: string } }>; readonly nextPageToken?: string }, unknown>
  readonly get: (request: { readonly projectId: string; readonly datasetId: string; readonly accessPolicyVersion: number; readonly datasetView: "ACL" }) => Effect.Effect<Dataset, unknown>
  readonly patch: (request: { readonly projectId: string; readonly datasetId: string; readonly accessPolicyVersion: number; readonly updateMode: "UPDATE_ACL"; readonly body: Dataset }) => Effect.Effect<Dataset, unknown>
}

export interface BigQueryLiveOptions {
  readonly project: string
  readonly operations?: DistilledBigQueryOperations
}

export class BigQueryIamLive extends Context.Service<BigQueryIamLive, BigQueryIamClient>()("@proxus/infra/alchemy/providers/bigquery-live/BigQueryIamLive") {}

const errorCode = (cause: unknown): BigQueryClientError["code"] => {
  const d = sanitizedCloudError(cause); const tag = d.gcpCode ?? ""
  if (d.status === 404 || tag === "NotFound" || tag === "NOT_FOUND") return "not-found"
  if (d.status === 401 || d.status === 403 || tag === "Forbidden" || tag === "Unauthorized" || tag === "PERMISSION_DENIED") return "forbidden"
  if (d.status === 409 || d.status === 412 || tag === "Conflict" || tag === "ABORTED" || tag === "10") return "conflict"
  if (d.status === 400 || d.status === 422 || tag === "BadRequest" || tag === "UnprocessableEntity" || tag === "INVALID_ARGUMENT") return "invalid"
  return "unknown"
}
const normalize = (operation: string) => (cause: unknown) => new BigQueryClientError({ operation, code: errorCode(cause), ...sanitizedCloudError(cause) })

const distilledLive = Layer.merge(fromADC(), FetchHttpClient.layer)
const provideLive = <A, E>(effect: Effect.Effect<A, E, Credentials | HttpClient.HttpClient>) => effect.pipe(Effect.provide(distilledLive))

const distilledBigQueryOperations: DistilledBigQueryOperations = {
  list: (request) => provideLive(listDatasets(request)),
  get: (request) => provideLive(getDatasets(request)),
  patch: (request) => provideLive(patchDatasets(request)),
}

const parts = (name: string): Effect.Effect<{ projectId: string; datasetId: string }, BigQueryClientError> =>
  Effect.try({
    try: () => {
      const match = /^projects\/([^/]+)\/datasets\/([^/]+)$/.exec(name)
      if (!match?.[1] || !match[2]) throw new Error("invalid dataset name")
      return { projectId: match[1], datasetId: match[2] }
    },
    catch: () => new BigQueryClientError({ operation: "parse-dataset", code: "invalid" }),
  })

const member = (entry: Access): string | undefined => entry.iamMember
  ?? (entry.userByEmail === undefined ? undefined : `user:${entry.userByEmail}`)
  ?? (entry.groupByEmail === undefined ? undefined : `group:${entry.groupByEmail}`)
  ?? (entry.domain === undefined ? undefined : `domain:${entry.domain}`)
  ?? (entry.specialGroup === undefined ? undefined : `specialGroup:${entry.specialGroup}`)

const policyOf = (dataset: Dataset): BigQueryIamPolicy => {
  const bindings: Array<BigQueryIamPolicy["bindings"][number]> = []
  for (const entry of dataset.access ?? []) {
    const principal = member(entry)
    if (entry.role === undefined || principal === undefined) continue
    const existing = bindings.find((binding) => binding.role === entry.role && JSON.stringify(binding.condition) === JSON.stringify(entry.condition))
    if (existing) (existing.members as string[]).push(principal)
    else bindings.push({ role: entry.role, members: [principal], ...(entry.condition === undefined ? {} : { condition: entry.condition }) })
  }
  return { ...(dataset.etag === undefined ? {} : { etag: dataset.etag }), version: 3, bindings, sourceAccess: dataset.access ?? [] }
}

const accessOf = (policy: BigQueryIamPolicy): ReadonlyArray<Access> => {
  const source = (policy.sourceAccess ?? []) as ReadonlyArray<Access>
  const nonIam = source.filter((entry) => entry.role === undefined || member(entry) === undefined)
  const iam: Access[] = policy.bindings.flatMap((binding) => binding.members.map((principal): Access => {
    const identity = principal.startsWith("user:") ? { userByEmail: principal.slice(5) }
      : principal.startsWith("group:") ? { groupByEmail: principal.slice(6) }
      : principal.startsWith("domain:") ? { domain: principal.slice(7) }
      : principal.startsWith("specialGroup:") ? { specialGroup: principal.slice(13) }
      : { iamMember: principal }
    const base: Access = { role: binding.role, ...identity }
    return binding.condition === undefined ? base : { ...base, condition: binding.condition as NonNullable<Access["condition"]> }
  }))
  return [...nonIam, ...iam]
}

export const makeLiveBigQueryIamClient = ({ project, operations = distilledBigQueryOperations }: BigQueryLiveOptions): BigQueryIamClient => {
  const map = <A>(operation: string, effect: Effect.Effect<A, unknown>) => effect.pipe(Effect.mapError(normalize(operation)))
  const listPage = (pageToken?: string): Effect.Effect<ReadonlyArray<string>, BigQueryClientError> =>
    map("list-datasets", operations.list({ projectId: project, ...(pageToken === undefined ? {} : { pageToken }) })).pipe(
      Effect.flatMap((page) => {
        const names = (page.datasets ?? []).flatMap(({ datasetReference }) => datasetReference?.projectId && datasetReference.datasetId ? [`projects/${datasetReference.projectId}/datasets/${datasetReference.datasetId}`] : [])
        return page.nextPageToken === undefined ? Effect.succeed(names) : listPage(page.nextPageToken).pipe(Effect.map((rest) => [...names, ...rest]))
      }),
    )
  return {
    listDatasets: () => listPage(),
    getIamPolicy: (name) => parts(name).pipe(Effect.flatMap(({ projectId, datasetId }) => map("get-iam-policy", operations.get({ projectId, datasetId, accessPolicyVersion: 3, datasetView: "ACL" }))), Effect.map(policyOf)),
    setIamPolicy: (name, policy) => parts(name).pipe(Effect.flatMap(({ projectId, datasetId }) => map("set-iam-policy", operations.patch({ projectId, datasetId, accessPolicyVersion: 3, updateMode: "UPDATE_ACL", body: { access: accessOf(policy), ...(policy.etag === undefined ? {} : { etag: policy.etag }) } }))), Effect.asVoid),
  }
}

export const bigQueryIamLiveLayer = (options: BigQueryLiveOptions) =>
  Layer.succeed(BigQueryIamLive, makeLiveBigQueryIamClient(options))
