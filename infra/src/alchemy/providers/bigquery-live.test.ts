// @effect-diagnostics asyncFunction:off anyUnknownInErrorContext:off
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { makeLiveBigQueryIamClient, type DistilledBigQueryOperations } from "./bigquery-live.ts"

const uncalled = () => Effect.die("unexpected cloud operation")
const operations = (overrides: Partial<DistilledBigQueryOperations>): DistilledBigQueryOperations => ({
  list: uncalled,
  get: uncalled,
  patch: uncalled,
  ...overrides,
})
const name = "projects/p/datasets/analytics"

describe("BigQuery Dataset IAM live adapter", () => {
  it("paginates canonical dataset names without cloud access", async () => {
    const requests: unknown[] = []
    const client = makeLiveBigQueryIamClient({ project: "p", operations: operations({
      list: (request) => {
        requests.push(request)
        return Effect.succeed(request.pageToken === undefined
          ? { datasets: [{ datasetReference: { projectId: "p", datasetId: "one" } }], nextPageToken: "next" }
          : { datasets: [{ datasetReference: { projectId: "p", datasetId: "two" } }] })
      },
    }) })
    expect(await Effect.runPromise(client.listDatasets())).toEqual(["projects/p/datasets/one", "projects/p/datasets/two"])
    expect(requests).toEqual([{ projectId: "p" }, { projectId: "p", pageToken: "next" }])
  })

  it("uses policy version 3 and preserves etag, conditions, and non-IAM ACL entries", async () => {
    const requests: unknown[] = []
    const dataset = { etag: "etag-1", access: [
      { role: "roles/bigquery.dataViewer", userByEmail: "a@example.test", condition: { title: "active", expression: "true" } },
      { view: { projectId: "p", datasetId: "shared", tableId: "v" } },
    ] }
    const client = makeLiveBigQueryIamClient({ project: "p", operations: operations({
      get: (request) => { requests.push(request); return Effect.succeed(dataset) },
      patch: (request) => { requests.push(request); return Effect.succeed(dataset) },
    }) })
    const policy = await Effect.runPromise(client.getIamPolicy(name))
    expect(policy).toMatchObject({ etag: "etag-1", version: 3, bindings: [{ role: "roles/bigquery.dataViewer", members: ["user:a@example.test"], condition: { title: "active", expression: "true" } }] })
    await Effect.runPromise(client.setIamPolicy(name, policy))
    expect(requests[0]).toEqual({ projectId: "p", datasetId: "analytics", accessPolicyVersion: 3, datasetView: "ACL" })
    expect(requests[1]).toMatchObject({ projectId: "p", datasetId: "analytics", accessPolicyVersion: 3, updateMode: "UPDATE_ACL", body: { etag: "etag-1", access: expect.arrayContaining([
      { role: "roles/bigquery.dataViewer", userByEmail: "a@example.test", condition: { title: "active", expression: "true" } },
      { view: { projectId: "p", datasetId: "shared", tableId: "v" } },
    ]) } })
  })

  it("normalizes only 404 as absence and keeps 403 fail-closed", async () => {
    for (const [tag, code] of [["NotFound", "not-found"], ["Forbidden", "forbidden"]] as const) {
      const client = makeLiveBigQueryIamClient({ project: "p", operations: operations({ get: () => Effect.fail({ _tag: tag }) }) })
      await expect(Effect.runPromise(client.getIamPolicy(name))).rejects.toMatchObject({ _tag: "BigQueryClientError", code })
    }
  })
})
