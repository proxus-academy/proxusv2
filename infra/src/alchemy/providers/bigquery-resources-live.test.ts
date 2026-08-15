// @effect-diagnostics asyncFunction:off
import type { Table } from "@distilled.cloud/gcp/bigquery-v2"
import * as Effect from "effect/Effect"
import { describe, expect, test, vi } from "vitest"
import { makeLiveBigQueryResourceClient, type DistilledBigQueryResourceOperations } from "./bigquery-resources-live.ts"

const operations = (getTable: DistilledBigQueryResourceOperations["getTable"]): DistilledBigQueryResourceOperations => ({
  getDataset: () => Effect.die("unused"),
  createDataset: () => Effect.die("unused"),
  deleteDataset: () => Effect.die("unused"),
  getTable,
  createTable: () => Effect.die("unused"),
  deleteTable: () => Effect.die("unused"),
})

const read = (response: Table) => {
  const getTable = vi.fn(() => Effect.succeed(response))
  const client = makeLiveBigQueryResourceClient(operations(getTable))
  return { getTable, effect: client.getTable("proxus-v2", "analytics", "events") }
}

// Sanitized, immutable shape captured from the real getTables call with ADC.
const capturedMissingTable = { _tag: "NotFound", status: "NOT_FOUND" } as const

describe("BigQuery Table live read response shape", () => {
  test("treats the real @distilled decoded 404 variant as absent", async () => {
    const getTable = vi.fn(() => Effect.fail(capturedMissingTable))
    const effect = makeLiveBigQueryResourceClient(operations(getTable)).getTable("proxus-v2", "analytics", "events")
    await expect(Effect.runPromise(effect)).rejects.toMatchObject({ _tag: "BigQueryResourceClientError", operation: "get-table", code: "not-found" })
    expect(getTable).toHaveBeenCalledWith({ projectId: "proxus-v2", datasetId: "analytics", tableId: "events", view: "FULL" })
  })

  test("fails closed for the decoded 403 variant", async () => {
    const getTable = () => Effect.fail({ _tag: "Forbidden", status: "PERMISSION_DENIED" } as const)
    const effect = makeLiveBigQueryResourceClient(operations(getTable)).getTable("proxus-v2", "analytics", "events")
    await expect(Effect.runPromise(effect)).rejects.toMatchObject({ _tag: "BigQueryResourceClientError", code: "forbidden" })
  })

  test("validates and maps a successful Table response", async () => {
    const { effect } = read({ tableReference: { projectId: "proxus-v2", datasetId: "analytics", tableId: "events" }, schema: { fields: [{ name: "eventId", type: "STRING", mode: "REQUIRED" }] }, labels: { managed_by: "alchemy" }, etag: "e1" })
    await expect(Effect.runPromise(effect)).resolves.toEqual({ project: "proxus-v2", datasetId: "analytics", tableId: "events", schema: [{ name: "eventId", type: "STRING", mode: "REQUIRED" }], labels: { managed_by: "alchemy" }, etag: "e1" })
  })

  test("rejects a malformed success instead of producing projectId undefined", async () => {
    const { effect } = read({ tableReference: { datasetId: "analytics", tableId: "events" }, schema: { fields: [] } })
    await expect(Effect.runPromise(effect)).rejects.toMatchObject({ _tag: "BigQueryResourceClientError", operation: "get-table", code: "invalid" })
  })
})
