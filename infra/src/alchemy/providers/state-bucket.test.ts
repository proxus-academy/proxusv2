// @effect-diagnostics strictBooleanExpressions:off asyncFunction:off anyUnknownInErrorContext:off
import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { makeStateBucketProviderService, StateBucketClientError, StateBucketDeletionProtectedError, type StateBucketClient, type StateBucketMetadata } from "./state-bucket.ts"
const desired = { project: "p", name: "state-bucket", location: "europe-southwest1", deletionProtection: true }
const run = <A, E>(e: Effect.Effect<A, E>) => Effect.runPromise(e)
const client = (initial?: StateBucketMetadata) => { let value = initial; const calls: string[] = []; const api: StateBucketClient = { get: () => value ? Effect.succeed(value) : Effect.fail(new StateBucketClientError({ operation: "get", code: "not-found" })), create: (p) => { calls.push("create"); value = { ...p, versioning: true, uniformBucketLevelAccess: true, publicAccessPrevention: "enforced" }; return Effect.succeed(value) }, patch: (_n, protections) => { calls.push("patch"); value = { ...value!, ...protections }; return Effect.succeed(value) } }; return { api, calls } }
describe("state bucket provider", () => {
  test("creates a protected bucket", async () => { const c = client(); const out = await run(makeStateBucketProviderService(c.api).reconcile({ news: desired } as never)); expect(c.calls).toEqual(["create"]); expect(out).toMatchObject({ versioning: true, uniformBucketLevelAccess: true, publicAccessPrevention: "enforced", deletionProtection: true }) })
  test("adopts by physical name and converges protections", async () => { const c = client({ name: desired.name, project: desired.project, location: desired.location, versioning: false, uniformBucketLevelAccess: false, publicAccessPrevention: "inherited" }); await run(makeStateBucketProviderService(c.api).reconcile({ news: desired } as never)); expect(c.calls).toEqual(["patch"]) })
  test("treats the uppercase location returned by the live Storage API as the same physical identity", async () => {
    const live = { name: desired.name, project: desired.project, location: "EUROPE-SOUTHWEST1", versioning: true, uniformBucketLevelAccess: true, publicAccessPrevention: "enforced" }
    const diff = await run(makeStateBucketProviderService(client(live).api).diff!({ news: desired, olds: desired, output: { ...live, deletionProtection: true } } as never))
    expect(diff).toBeUndefined()
  })
  test("never deletes a protected physical bucket", async () => { const c = client(); const effect = makeStateBucketProviderService(c.api).delete({ output: { ...desired, versioning: true, uniformBucketLevelAccess: true, publicAccessPrevention: "enforced" } } as never); await expect(run(effect)).rejects.toBeInstanceOf(StateBucketDeletionProtectedError); expect(c.calls).toEqual([]) })
})
