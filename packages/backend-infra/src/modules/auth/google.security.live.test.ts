// @effect-diagnostics strictEffectProvide:off asyncFunction:off
import { GoogleIdentityRejected } from "@proxus/backend-domain/auth"
import { GoogleSecurity } from "@proxus/backend-domain/auth/google-live"
import { Clock, Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { makeGoogleSecurityLive } from "./google.security.live.js"

const secret = "a-secure-google-signing-key-with-32-bytes-minimum"
const at = (millis: number) => Layer.succeed(Clock.Clock, {
  currentTimeMillisUnsafe: () => millis, currentTimeMillis: Effect.succeed(millis),
  currentTimeNanosUnsafe: () => BigInt(millis) * 1_000_000n,
  currentTimeNanos: Effect.succeed(BigInt(millis) * 1_000_000n), sleep: () => Effect.void,
})

describe("GoogleSecurityLive", () => {
  it("rejects tampered state and expired state/pending tokens", async () => {
    const program = Effect.gen(function*() {
      const security = yield* GoogleSecurity
      const state = yield* security.signState({ intent: "login", nonce: "n".repeat(32), expiresAt: 101 })
      const pending = yield* security.signPending({ subject: "subject", email: "verified@example.com", expiresAt: 101 })
      expect((yield* security.verifyState(state)).nonce).toBe("n".repeat(32))
      expect((yield* Effect.flip(security.verifyState(`${state}x`)))).toBeInstanceOf(GoogleIdentityRejected)
      return pending
    })
    const pending = await Effect.runPromise(program.pipe(Effect.provide(Layer.merge(makeGoogleSecurityLive(secret), at(100)))))
    const expired = Effect.gen(function*() { return yield* Effect.flip((yield* GoogleSecurity).verifyPending(pending)) })
    expect(await Effect.runPromise(expired.pipe(Effect.provide(Layer.merge(makeGoogleSecurityLive(secret), at(101)))))).toBeInstanceOf(GoogleIdentityRejected)
  })
})
