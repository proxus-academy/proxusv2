import { describe, expect, it } from "vitest"
import { initialRecoveryState, transitionRecovery, type RecoveryState } from "@proxus/frontend-core/auth"

class FakeAuthTransport {
  private password = "old-password"
  private sessions = new Set(["session-before-reset"])
  readonly resetCode = "123456"
  requestReset(_email: string) { return { accepted: true as const } }
  confirmReset(code: string, password: string) {
    if (code !== this.resetCode) throw new Error("generic authentication failure")
    this.password = password
    this.sessions.clear()
    return { accepted: true as const }
  }
  session(token: string) { return this.sessions.has(token) }
  login(password: string) { return password === this.password }
}

describe("public recovery journey with fake transport", () => {
  it("resends with cooldown, resets, returns to login and invalidates old sessions", () => {
    const transport = new FakeAuthTransport()
    let state: RecoveryState = initialRecoveryState
    state = transitionRecovery(state, { _tag: "ForgotRequested", email: "student@example.com" })
    expect(transport.requestReset(state.email)).toEqual({ accepted: true })
    state = transitionRecovery(state, { _tag: "CodeRequested" })
    expect(state).toMatchObject({ screen: "code", cooldownSeconds: 30 })
    state = transitionRecovery(state, { _tag: "CooldownElapsed" })
    state = transitionRecovery(state, { _tag: "Resent", cooldownSeconds: 30 })
    expect(state).toMatchObject({ cooldownSeconds: 30 })
    state = transitionRecovery(state, { _tag: "CodeAccepted", code: transport.resetCode })
    if (state.screen !== "new-password") throw new Error("expected password screen")
    expect(transport.confirmReset(state.code, "new-password")).toEqual({ accepted: true })
    state = transitionRecovery(state, { _tag: "PasswordReset" })
    state = transitionRecovery(state, { _tag: "BackToLogin" })
    expect(state.screen).toBe("login")
    expect(transport.session("session-before-reset")).toBe(false)
    expect(transport.login("new-password")).toBe(true)
  })

  it("uses the same generic failure for invalid codes", () => {
    const transport = new FakeAuthTransport()
    expect(() => transport.confirmReset("000000", "new-password")).toThrow("generic authentication failure")
  })
})
