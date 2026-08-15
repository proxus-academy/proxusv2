// @effect-diagnostics asyncFunction:off strictBooleanExpressions:off anyUnknownInErrorContext:off
import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { makeLiveCloudRunServiceClient, type DistilledCloudRunOperations } from "./cloud-run-service-live.ts"

const operations = (overrides: Partial<DistilledCloudRunOperations> = {}): DistilledCloudRunOperations => ({
  get: () => Effect.succeed({ name: "projects/p/locations/r/services/s", iapEnabled: true, invokerIamDisabled: false }),
  list: () => Effect.succeed({ services: [] }),
  create: () => Effect.succeed({ name: "projects/p/locations/r/operations/1" }),
  patch: () => Effect.succeed({ name: "projects/p/locations/r/operations/1" }),
  delete: () => Effect.succeed({ name: "projects/p/locations/r/operations/1" }),
  operation: () => Effect.succeed({ done: true }),
  sleep: Effect.void,
  ...overrides,
})

describe("live Cloud Run v2 client", () => {
  it("polls an LRO to completion and reads the final service", async () => {
    const operation = vi.fn().mockReturnValueOnce(Effect.succeed({ done: false })).mockReturnValueOnce(Effect.succeed({ done: true }))
    const client = makeLiveCloudRunServiceClient({ project: "p", location: "r", operations: operations({ operation }), maxOperationPolls: 3 })
    await expect(Effect.runPromise(client.create("projects/p/locations/r", "s", { iapEnabled: true }))).resolves.toMatchObject({ iapEnabled: true })
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it("bounds LRO polling and fails closed on operation errors", async () => {
    const pending = operations({ operation: () => Effect.succeed({ done: false }) })
    await expect(Effect.runPromise(makeLiveCloudRunServiceClient({ project: "p", location: "r", operations: pending, maxOperationPolls: 2 }).delete("n"))).rejects.toMatchObject({ code: "timeout" })
    const failed = operations({ operation: () => Effect.succeed({ done: true, error: { code: 3, message: "labels: invalid value" } }) })
    await expect(Effect.runPromise(makeLiveCloudRunServiceClient({ project: "p", location: "r", operations: failed }).delete("n"))).rejects.toMatchObject({
      code: "operation-failed", operation: "delete", message: "labels: invalid value",
    })
  })

  it("paginates within a hard bound and normalizes forbidden without leaking its body", async () => {
    const list = vi.fn(({ pageToken }: { pageToken?: string }) => Effect.succeed(pageToken ? { services: [{ name: "b" }] } : { services: [{ name: "a" }], nextPageToken: "next" }))
    const client = makeLiveCloudRunServiceClient({ project: "p", location: "r", operations: operations({ list }) })
    await expect(Effect.runPromise(client.list("ignored"))).resolves.toHaveLength(2)
    const forbidden = operations({ get: () => Effect.fail({ _tag: "Forbidden", message: "secret response" }) })
    await expect(Effect.runPromise(makeLiveCloudRunServiceClient({ project: "p", location: "r", operations: forbidden }).get("n"))).rejects.toEqual(expect.objectContaining({ code: "forbidden", operation: "get" }))

    const invalid = operations({ create: () => Effect.fail({ statusCode: 400, error: { code: "INVALID_ARGUMENT", message: "labels: token=top-secret is invalid" }, response: { body: "must not leak" } }) })
    await expect(Effect.runPromise(makeLiveCloudRunServiceClient({ project: "p", location: "r", operations: invalid }).create("parent", "s", {}))).rejects.toMatchObject({
      code: "invalid", operation: "create", status: 400, gcpCode: "INVALID_ARGUMENT", message: "labels: token=[REDACTED] is invalid",
    })
  })
})
