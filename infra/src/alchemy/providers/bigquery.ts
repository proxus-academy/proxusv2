// @effect-diagnostics strictBooleanExpressions:off effectSucceedWithVoid:off
import { Resource } from "alchemy"
import { isResolved } from "alchemy/Diff"
import * as Provider from "alchemy/Provider"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import type { DependsOn } from "../resource-dependency.ts"
import { mutateIamPolicy } from "./iam-policy-mutation.ts"

/** BigQuery failures are normalized so cloud response bodies never cross this port. */
export class BigQueryClientError extends Data.TaggedError("BigQueryClientError")<{
  readonly operation: string
  readonly code: "not-found" | "forbidden" | "conflict" | "invalid" | "unknown"
  readonly status?: number
  readonly gcpCode?: string
  readonly message?: string
}> {}

export interface BigQueryIamPolicy {
  readonly etag?: string
  readonly version?: number
  /** Adapter-owned snapshot used to preserve non-IAM dataset ACL entries on writes. */
  readonly sourceAccess?: ReadonlyArray<{
    readonly role?: string
    readonly condition?: unknown
    readonly iamMember?: string
    readonly userByEmail?: string
    readonly groupByEmail?: string
    readonly domain?: string
    readonly specialGroup?: string
    readonly [key: string]: unknown
  }>
  readonly bindings: ReadonlyArray<{
    readonly role: string
    readonly members: ReadonlyArray<string>
    readonly condition?: unknown
  }>
}

/** Dataset names use the canonical `projects/{project}/datasets/{dataset}` form. */
export interface BigQueryIamClient {
  listDatasets(): Effect.Effect<ReadonlyArray<string>, BigQueryClientError>
  getIamPolicy(dataset: string): Effect.Effect<BigQueryIamPolicy, BigQueryClientError>
  setIamPolicy(dataset: string, policy: BigQueryIamPolicy): Effect.Effect<void, BigQueryClientError>
}

interface BigQueryDatasetIamMemberProps extends DependsOn {
  readonly dataset: string
  readonly role: string
  readonly member: string
}
export type BigQueryDatasetIamMemberAttributes = BigQueryDatasetIamMemberProps
export type BigQueryDatasetIamMember = Resource<
  "Proxus.GCP.BigQuery.DatasetIamMember",
  BigQueryDatasetIamMemberProps,
  BigQueryDatasetIamMemberAttributes
>
export const BigQueryDatasetIamMember = Resource<BigQueryDatasetIamMember>("Proxus.GCP.BigQuery.DatasetIamMember")

const isMissing = (error: BigQueryClientError) => error.code === "not-found"
const isUnconditional = (binding: BigQueryIamPolicy["bindings"][number]) => binding.condition === undefined
const hasMember = (policy: BigQueryIamPolicy, role: string, member: string) =>
  policy.bindings.some((binding) => binding.role === role && isUnconditional(binding) && binding.members.includes(member))

const membersOf = (dataset: string, policy: BigQueryIamPolicy): ReadonlyArray<BigQueryDatasetIamMemberAttributes> => {
  const seen = new Set<string>()
  const result: BigQueryDatasetIamMemberAttributes[] = []
  for (const binding of policy.bindings) {
    if (!isUnconditional(binding)) continue
    for (const member of binding.members) {
      const key = `${binding.role}\u0000${member}`
      if (seen.has(key)) continue
      seen.add(key)
      result.push({ dataset, role: binding.role, member })
    }
  }
  return result
}

export const makeBigQueryDatasetIamMemberProviderService = (client: BigQueryIamClient) =>
  BigQueryDatasetIamMember.Provider.of({
    stables: ["dataset", "role", "member"],
    list: () =>
      client.listDatasets().pipe(
        Effect.flatMap((datasets) => Effect.all(datasets.map((dataset) =>
          client.getIamPolicy(dataset).pipe(
            Effect.map((policy) => membersOf(dataset, policy)),
            Effect.catchIf(isMissing, () => Effect.succeed([])),
          )))),
        Effect.map((groups) => groups.flat()),
      ),
    diff: ({ news, olds, output }) => {
      if (!isResolved(news)) return Effect.void
      return Effect.succeed(
        (["dataset", "role", "member"] as const).some((key) => (output?.[key] ?? olds[key]) !== news[key])
          ? ({ action: "replace" } as const)
          : undefined,
      )
    },
    read: ({ output, olds }) => {
      const value = {
        dataset: output?.dataset ?? olds.dataset,
        role: output?.role ?? olds.role,
        member: output?.member ?? olds.member,
      }
      if (!value.dataset || !value.role || !value.member) return Effect.succeed(undefined)
      return client.getIamPolicy(value.dataset).pipe(
        Effect.map((policy) => hasMember(policy, value.role, value.member) ? value as BigQueryDatasetIamMemberAttributes : undefined),
        Effect.catchIf(isMissing, () => Effect.succeed(undefined)),
      )
    },
    reconcile: ({ news }) =>
      Effect.gen(function* () {
        yield* mutateIamPolicy({ resource: `bigquery:${news.dataset}`, read: () => client.getIamPolicy(news.dataset), change: (policy) => {
          if (hasMember(policy, news.role, news.member)) return undefined
          const bindings = policy.bindings.map((binding) => ({ ...binding, members: [...binding.members] }))
          const binding = bindings.find((candidate) => candidate.role === news.role && isUnconditional(candidate))
          if (binding) binding.members = [...binding.members, news.member]
          else bindings.push({ role: news.role, members: [news.member] })
          return { ...policy, version: Math.max(policy.version ?? 0, 3), bindings }
        }, write: (policy) => client.setIamPolicy(news.dataset, policy) })
        return { dataset: news.dataset, role: news.role, member: news.member }
      }),
    delete: ({ output }) =>
      mutateIamPolicy({ resource: `bigquery:${output.dataset}`, read: () => client.getIamPolicy(output.dataset), change: (policy) => {
        if (!hasMember(policy, output.role, output.member)) return undefined
        return { ...policy, bindings: policy.bindings.map((binding) => binding.role === output.role && isUnconditional(binding)
          ? { ...binding, members: binding.members.filter((member) => member !== output.member) }
          : { ...binding, members: [...binding.members] }).filter((binding) => binding.members.length > 0) }
      }, write: (policy) => client.setIamPolicy(output.dataset, policy) }).pipe(
        Effect.catchIf((error) => error.code === "not-found", () => Effect.void),
      ),
  })

export const BigQueryDatasetIamMemberProvider = (client: BigQueryIamClient) =>
  Provider.succeed(BigQueryDatasetIamMember, makeBigQueryDatasetIamMemberProviderService(client))
