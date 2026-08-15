// @effect-diagnostics asyncFunction:off anyUnknownInErrorContext:off
import * as Effect from "effect/Effect"
import { describe, expect, it, vi } from "vitest"
import { makeLiveProjectIamClient, type DistilledProjectIamOperations } from "./project-iam-member-live.ts"

describe("Project IAM @distilled live adapter", () => {
  it("requests policy v3 and writes the complete optimistic policy", async () => {
    const policy = { etag: "etag", version: 3, bindings: [{ role: "roles/viewer", members: ["user:a@example.com"], condition: { title: "c", expression: "true" } }] }
    const operations: DistilledProjectIamOperations = { getPolicy: vi.fn(() => Effect.succeed(policy)), setPolicy: vi.fn(() => Effect.succeed(policy)) }
    const client = makeLiveProjectIamClient({ operations })
    expect(await Effect.runPromise(client.getIamPolicy("proxus-test"))).toEqual(policy)
    await Effect.runPromise(client.setIamPolicy("proxus-test", policy))
    expect(operations.getPolicy).toHaveBeenCalledWith({ resource: "projects/proxus-test", body: { options: { requestedPolicyVersion: 3 } } })
    expect(operations.setPolicy).toHaveBeenCalledWith({ resource: "projects/proxus-test", body: { policy, updateMask: "bindings,etag,version" } })
  })

  it.each(["Forbidden", "Unauthorized"])("normalizes %s without swallowing it", async (_tag) => {
    const operations = { getPolicy: () => Effect.fail({ _tag }), setPolicy: () => Effect.fail({ _tag }) } as DistilledProjectIamOperations
    await expect(Effect.runPromise(makeLiveProjectIamClient({ operations }).getIamPolicy("proxus-test"))).rejects.toMatchObject({ code: "forbidden" })
  })
})
