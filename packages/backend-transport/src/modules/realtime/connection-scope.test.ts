import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { anonymousRealtimeScope, requirePrivateRealtimeScope } from "./connection-scope.js"

describe("realtime connection authorization", () => {
  // @effect-diagnostics-next-line asyncFunction:off
  it("fails closed for private anonymous connections", async () => {
    expect(await Effect.runPromise(Effect.flip(requirePrivateRealtimeScope(anonymousRealtimeScope, "account:read"))))
      .toMatchObject({ _tag: "PrivateRealtimeConnectionRejected" })
  })

  // @effect-diagnostics-next-line asyncFunction:off
  it("preserves verified principal, user, session, roles and permissions", async () => {
    const scope = {
      _tag: "Authenticated" as const,
      principalId: "principal-1",
      userId: "user-1",
      sessionId: "session-1",
      roles: new Set(["member"]),
      permissions: new Set(["account:read"]),
    }
    expect(await Effect.runPromise(requirePrivateRealtimeScope(scope, "account:read"))).toBe(scope)
    expect(Effect.runSync(Effect.flip(requirePrivateRealtimeScope(scope, "admin:read"))))
      .toMatchObject({ _tag: "PrivateRealtimeConnectionRejected" })
  })
})
