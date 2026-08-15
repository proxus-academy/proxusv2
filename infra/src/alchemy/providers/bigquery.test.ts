// @effect-diagnostics asyncFunction:off strictBooleanExpressions:off anyUnknownInErrorContext:off
import { Effect } from "effect"
import type { ScopedPlanStatusSession } from "alchemy/Cli/Cli"
import { describe, expect, it } from "vitest"
import {
  BigQueryClientError,
  makeBigQueryDatasetIamMemberProviderService,
  type BigQueryIamClient,
  type BigQueryIamPolicy,
} from "./bigquery.ts"

const run = Effect.runPromise
const session = { note: () => Effect.void } as unknown as ScopedPlanStatusSession
const base = { id: "Reader", fqn: "prod/Reader", instanceId: "i", session, bindings: [] }

const fixture = () => {
  const policies = new Map<string, BigQueryIamPolicy>()
  const calls: string[] = []
  const missing = (operation: string) => Effect.fail(new BigQueryClientError({ operation, code: "not-found" }))
  const client: BigQueryIamClient = {
    listDatasets: () => Effect.succeed([...policies.keys()]),
    getIamPolicy: (dataset) => {
      calls.push(`get:${dataset}`)
      const policy = policies.get(dataset)
      return policy ? Effect.succeed(policy) : missing("get-policy")
    },
    setIamPolicy: (dataset, policy) => {
      calls.push(`set:${dataset}`)
      policies.set(dataset, policy)
      return Effect.void
    },
  }
  return { policies, calls, client }
}

const dataset = "projects/p/datasets/analytics"
const desired = { dataset, role: "roles/bigquery.dataViewer", member: "serviceAccount:reader@example.test" }

describe("BigQueryDatasetIamMember provider", () => {
  it("reconciles and deletes only its unconditional membership idempotently", async () => {
    const f = fixture()
    f.policies.set(dataset, { etag: "etag-1", version: 3, bindings: [
      { role: desired.role, members: ["user:foreign@example.test"] },
      { role: desired.role, members: [desired.member], condition: { title: "foreign-condition" } },
      { role: "roles/bigquery.dataEditor", members: ["group:owners@example.test"] },
    ] })
    const provider = makeBigQueryDatasetIamMemberProviderService(f.client)

    const output = await run(provider.reconcile({ ...base, news: desired, olds: undefined, output: undefined }))
    await run(provider.reconcile({ ...base, news: desired, olds: desired, output }))
    expect(f.calls.filter((call) => call.startsWith("set:"))).toHaveLength(1)
    expect(await run(provider.read!({ ...base, olds: desired, output }))).toEqual(desired)

    await run(provider.delete({ ...base, olds: desired, output }))
    await run(provider.delete({ ...base, olds: desired, output }))
    expect(f.policies.get(dataset)).toEqual({ etag: "etag-1", version: 3, bindings: [
      { role: desired.role, members: ["user:foreign@example.test"] },
      { role: desired.role, members: [desired.member], condition: { title: "foreign-condition" } },
      { role: "roles/bigquery.dataEditor", members: ["group:owners@example.test"] },
    ] })
  })

  it("lists existing unconditional members for adoption without claiming conditional bindings", async () => {
    const f = fixture()
    f.policies.set(dataset, { bindings: [
      { role: desired.role, members: [desired.member, desired.member] },
      { role: desired.role, members: ["user:conditional@example.test"], condition: { title: "expires" } },
    ] })
    const provider = makeBigQueryDatasetIamMemberProviderService(f.client)

    expect(await run(provider.list())).toEqual([desired])
    expect(await run(provider.read!({ ...base, olds: desired, output: undefined }))).toEqual(desired)
  })

  it("propagates forbidden as a typed operational error from read, list, reconcile and delete", async () => {
    const f = fixture()
    const forbidden = (operation: string) => Effect.fail(new BigQueryClientError({ operation, code: "forbidden" }))
    const provider = makeBigQueryDatasetIamMemberProviderService({
      ...f.client,
      listDatasets: () => forbidden("list"),
      getIamPolicy: () => forbidden("get-policy"),
    })

    for (const effect of [
      provider.read!({ ...base, olds: desired, output: undefined }),
      provider.list(),
      provider.reconcile({ ...base, news: desired, olds: undefined, output: undefined }),
      provider.delete({ ...base, olds: desired, output: desired }),
    ]) {
      await expect(run(effect)).rejects.toMatchObject({ _tag: "BigQueryClientError", code: "forbidden" })
    }
  })

  it("treats missing datasets as absent and detects immutable changes", async () => {
    const f = fixture()
    const provider = makeBigQueryDatasetIamMemberProviderService(f.client)
    expect(await run(provider.read!({ ...base, olds: desired, output: undefined }))).toBeUndefined()
    expect(await run(provider.diff!({
      ...base,
      olds: desired,
      news: { ...desired, member: "user:replacement@example.test" },
      output: desired,
      oldBindings: [],
      newBindings: [],
    }))).toEqual({ action: "replace" })
    await run(provider.delete({ ...base, olds: desired, output: desired }))
  })
})
