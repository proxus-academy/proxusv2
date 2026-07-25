import { Capabilities } from "@proxus/shared/access-control"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { AdminAccessClient, AdminCapabilitiesError, AdminForbidden, AdminUnauthorized, adminAccessLayer, hasPermission } from "./admin-auth.js"

// Test adapter intentionally accepts arbitrary fake transport failures and owns the runtime boundary.
// @effect-diagnostics anyUnknownInErrorContext:off strictEffectProvide:off
const loadWith = (effect: Effect.Effect<Capabilities, unknown>) => Effect.runPromiseExit(
  AdminAccessClient.use((client) => client.capabilities()).pipe(Effect.provide(adminAccessLayer(() => effect))),
)
const responseError = (status: number) => ({ response: { status } })

// Vitest owns these Promise-returning test boundaries.
// @effect-diagnostics asyncFunction:off

describe("admin access integration with fake HTTP", () => {
  it("loads capabilities and exposes only received controls", async () => {
    const capabilities = new Capabilities({ permissions: ["studyNode:rename"] })
    const exit = await loadWith(Effect.succeed(capabilities))
    expect(exit._tag).toBe("Success")
    expect(hasPermission(capabilities, "studyNode:rename")).toBe(true)
    expect(hasPermission(capabilities, "studyNode:archive")).toBe(false)
  })

  it("keeps 401, 403 and transport failure distinct for the guard", async () => {
    const unauthorized = await loadWith(Effect.fail(responseError(401)))
    const forbidden = await loadWith(Effect.fail(responseError(403)))
    const unavailable = await loadWith(Effect.fail({ _tag: "Offline" as const }))
    expect(unauthorized._tag === "Failure" && unauthorized.cause.reasons[0]?._tag === "Fail" && unauthorized.cause.reasons[0].error).toBeInstanceOf(AdminUnauthorized)
    expect(forbidden._tag === "Failure" && forbidden.cause.reasons[0]?._tag === "Fail" && forbidden.cause.reasons[0].error).toBeInstanceOf(AdminForbidden)
    expect(unavailable._tag === "Failure" && unavailable.cause.reasons[0]?._tag === "Fail" && unavailable.cause.reasons[0].error).toBeInstanceOf(AdminCapabilitiesError)
  })
})
