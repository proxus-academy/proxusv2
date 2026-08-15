// @effect-diagnostics asyncFunction:off strictBooleanExpressions:off anyUnknownInErrorContext:off
import { Unowned } from "alchemy/AdoptPolicy"
import type { ScopedPlanStatusSession } from "alchemy/Cli/Cli"
import * as Effect from "effect/Effect"
import { describe, expect, test } from "vitest"
import { BigQueryResourceClientError, makeBigQueryDatasetProviderService, makeBigQueryTableProviderService, type BigQueryDatasetMetadata, type BigQueryResourceClient, type BigQueryTableMetadata } from "./bigquery-resources.ts"
import { ownerLabelValue } from "./owner-label.ts"
const run = Effect.runPromise
const base = { id: "Analytics", fqn: "preview-platform/Analytics", instanceId: "i", session: { note: () => Effect.void } as unknown as ScopedPlanStatusSession, bindings: [] }
const fake = () => {
  let dataset: BigQueryDatasetMetadata | undefined; let table: BigQueryTableMetadata | undefined; const calls: string[] = []; const reads: unknown[][] = []
  const absent = (op: string) => Effect.fail(new BigQueryResourceClientError({ operation: op, code: "not-found" }))
  const client: BigQueryResourceClient = {
    getDataset: (...args) => { reads.push([...args]); return dataset ? Effect.succeed(dataset) : absent("get-dataset") },
    createDataset: (v) => Effect.sync(() => { calls.push("create-dataset"); dataset = v; return v }), deleteDataset: () => Effect.void,
    getTable: (...args) => { reads.push([...args]); return table ? Effect.succeed(table) : absent("get-table") },
    createTable: (v) => Effect.sync(() => { calls.push("create-table"); table = v; return v }), deleteTable: () => Effect.void,
  }
  return { client, calls, reads, setDataset: (v: BigQueryDatasetMetadata) => { dataset = v } }
}
describe("BigQuery dataset/table providers", () => {
  test("create idempotently, mark foreign resources for explicit adoption, and retain protected resources", async () => {
    const f = fake(); const datasets = makeBigQueryDatasetProviderService(f.client)
    const news = { project: "proxus-v2", datasetId: "preview_product_analytics", location: "europe-southwest1", labels: {}, deletionProtection: true as const }
    expect(await run(datasets.read!({ ...base, olds: undefined as never, output: undefined }))).toBeUndefined()
    expect(f.reads).toEqual([])
    const output = await run(datasets.reconcile({ ...base, news, olds: undefined, output: undefined }))
    expect(output.labels.proxus_alchemy_fqn).toBe(ownerLabelValue(base.fqn))
    expect(output.labels.proxus_alchemy_fqn).toMatch(/^[a-z0-9_-]{1,63}$/)
    expect(await run(datasets.read!({ ...base, olds: news, output }))).toEqual(output)
    await run(datasets.delete({ ...base, olds: news, output }))
    expect(await run(datasets.read!({ ...base, olds: news, output }))).toEqual(output)
    f.setDataset({ ...output, labels: {} })
    expect(await run(datasets.read!({ ...base, olds: news, output }))).toEqual(Unowned({ ...output, labels: {} }))

    const tables = makeBigQueryTableProviderService(f.client)
    const tableNews = { project: "proxus-v2", datasetId: news.datasetId, tableId: "events", schema: [{ name: "eventId", type: "STRING" as const, mode: "REQUIRED" as const }], labels: {}, deletionProtection: true as const }
    const readsBeforeNewTable = f.reads.length
    expect(await run(tables.read!({ ...base, olds: undefined as never, output: undefined }))).toBeUndefined()
    expect(f.reads).toHaveLength(readsBeforeNewTable)
    const table = await run(tables.reconcile({ ...base, news: tableNews, olds: undefined, output: undefined }))
    await run(tables.delete({ ...base, olds: tableNews, output: table }))
    expect(f.calls).toEqual(["create-dataset", "create-table"])
  })
})
