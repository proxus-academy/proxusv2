// @effect-diagnostics asyncFunction:off anyUnknownInErrorContext:off
import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import { makeLiveCdnClients, type DistilledCdnOperations } from "./cdn-live.ts"
import { productionCdnPolicy } from "./cdn.ts"

const run = Effect.runPromise
const fixture = () => {
  const resource = { name: "website", bucketName: "private-web", enableCdn: true, compressionMode: "AUTOMATIC", cdnPolicy: productionCdnPolicy, id: "42", selfLink: "link" } as const
  const operations: DistilledCdnOperations = {
    generateIdentity: vi.fn(() => Effect.succeed({ name: "operations/identity" })),
    usageOperation: vi.fn(() => Effect.succeed({ name: "operations/identity", done: true, response: { email: "service-123@cloud-cdn-fill.iam.gserviceaccount.com" } })),
    getBucket: vi.fn(() => Effect.succeed(resource)),
    insertBucket: vi.fn(() => Effect.succeed({ name: "insert-1", status: "PENDING" })),
    patchBucket: vi.fn(() => Effect.succeed({ name: "patch-1", status: "PENDING" })),
    deleteBucket: vi.fn(() => Effect.succeed({ name: "delete-1", status: "DONE" })),
    computeOperation: vi.fn(({ operation }) => Effect.succeed({ name: operation, status: "DONE" })), sleep: Effect.void,
  }
  return { operations, clients: makeLiveCdnClients({ project: "proxus", operations }) }
}
describe("CDN live providers", () => {
  it("generates and awaits the Google-managed CDN service identity", async () => {
    const f = fixture(); expect(await run(f.clients.identity.getOrCreate("proxus", "cloudcdn.googleapis.com"))).toBe("service-123@cloud-cdn-fill.iam.gserviceaccount.com")
    expect(f.operations.generateIdentity).toHaveBeenCalledWith({ parent: "projects/proxus/services/cloudcdn.googleapis.com" })
  })
  it("uses retry request IDs, awaits Compute LROs and reads after mutation", async () => {
    const f = fixture(); const value = await run(f.clients.bucket.create("proxus", { name: "website", bucketName: "private-web", enableCdn: true, compressionMode: "AUTOMATIC", cdnPolicy: productionCdnPolicy }))
    expect(value).toMatchObject({ id: "42", enableCdn: true }); expect(f.operations.insertBucket).toHaveBeenCalledWith(expect.objectContaining({ project: "proxus", requestId: expect.stringMatching(/^[0-9a-f-]{36}$/) }))
    expect(f.operations.computeOperation).toHaveBeenCalledWith({ project: "proxus", operation: "insert-1" }); expect(f.operations.getBucket).toHaveBeenCalledWith({ project: "proxus", backendBucket: "website" })
  })
  it("fails closed on LRO errors", async () => {
    const f = fixture(); vi.mocked(f.operations.computeOperation).mockImplementationOnce(() => Effect.succeed({ status: "DONE", error: { errors: [{ code: "FAILED" }] } }))
    await expect(run(f.clients.bucket.patch("proxus", "website", { name: "website" }))).rejects.toMatchObject({ code: "operation-failed" })
  })
})
