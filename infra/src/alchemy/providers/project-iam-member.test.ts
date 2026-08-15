// @effect-diagnostics asyncFunction:off unsafeEffectTypeAssertion:off anyUnknownInErrorContext:off
import type { ScopedPlanStatusSession } from "alchemy/Cli/Cli"
import * as Effect from "effect/Effect"
import { describe, expect, it } from "vitest"
import { makeProjectIamMemberProviderService, ProjectIamClientError, type ProjectIamClient, type ProjectIamPolicy } from "./project-iam-member.ts"

const run = <A>(e: Effect.Effect<A, unknown, unknown>) => Effect.runPromise(e as Effect.Effect<A, unknown, never>)
const session = { note: () => Effect.void } as unknown as ScopedPlanStatusSession
const args = { id: "x", fqn: "stack/x", instanceId: "i", session, bindings: [] }
const desired = { projectId: "proxus-test", role: "roles/cloudsql.client", member: "serviceAccount:runtime@proxus-test.iam.gserviceaccount.com" }
const fake = () => {
  let policy: ProjectIamPolicy = { etag: "etag-1", version: 3, bindings: [{ role: "roles/viewer", members: ["user:owner@example.com"], condition: { title: "preserved", expression: "true" } }] }
  let writes = 0
  const client: ProjectIamClient = { getIamPolicy: () => Effect.succeed(policy), setIamPolicy: (_project, next) => Effect.sync(() => { writes++; policy = next }) }
  return { client, policy: () => policy, writes: () => writes }
}

describe("ProjectIamMember provider", () => {
  it("adopts and converges additively, preserving etag, v3 and conditioned bindings", async () => {
    const f = fake(); const provider = makeProjectIamMemberProviderService(f.client)
    expect(await run(provider.read!({ ...args, olds: desired, output: undefined }))).toBeUndefined()
    const output = await run(provider.reconcile({ ...args, news: desired, olds: undefined, output: undefined }))
    expect(f.policy()).toEqual({ etag: "etag-1", version: 3, bindings: [
      { role: "roles/viewer", members: ["user:owner@example.com"], condition: { title: "preserved", expression: "true" } },
      { role: desired.role, members: [desired.member] },
    ] })
    await run(provider.reconcile({ ...args, news: desired, olds: desired, output }))
    expect(f.writes()).toBe(1)
    expect(await run(provider.read!({ ...args, olds: desired, output }))).toEqual(desired)
  })

  it("removes only its unconditional member and is idempotent", async () => {
    const f = fake(); const provider = makeProjectIamMemberProviderService(f.client)
    const output = await run(provider.reconcile({ ...args, news: desired, olds: undefined, output: undefined }))
    await run(provider.delete({ ...args, olds: desired, output })); await run(provider.delete({ ...args, olds: desired, output }))
    expect(f.policy().bindings).toEqual([{ role: "roles/viewer", members: ["user:owner@example.com"], condition: { title: "preserved", expression: "true" } }])
  })

  it("fails closed on forbidden reads and rejects public principals", async () => {
    const forbidden = new ProjectIamClientError({ operation: "get", code: "forbidden" })
    const provider = makeProjectIamMemberProviderService({ getIamPolicy: () => Effect.fail(forbidden), setIamPolicy: () => Effect.void })
    await expect(run(provider.read!({ ...args, olds: desired, output: undefined }))).rejects.toBe(forbidden)
    await expect(run(provider.reconcile({ ...args, news: desired, olds: undefined, output: undefined }))).rejects.toBe(forbidden)
    for (const member of ["allUsers", "allAuthenticatedUsers"]) await expect(run(provider.reconcile({ ...args, news: { ...desired, member }, olds: undefined, output: undefined }))).rejects.toMatchObject({ code: "invalid" })
  })
})
