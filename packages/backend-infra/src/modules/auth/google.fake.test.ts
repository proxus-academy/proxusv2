// @effect-diagnostics strictEffectProvide:off asyncFunction:off
import { GoogleIdentityProvider, GoogleIdentityRejected } from "@proxus/backend-domain/auth"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { makeFakeGoogleIdentityProvider } from "./google.fake.js"

describe("FakeGoogleIdentityProvider", () => {
  it("binds a configured verified identity to the issued state nonce", async () => {
    const layer = makeFakeGoogleIdentityProvider([{ code: "ok", identity: { subject: "g-1", email: "verified@example.com", emailVerified: true, displayName: "Ignored by registration" } }])
    const result = await Effect.runPromise(Effect.gen(function*() {
      const google = yield* GoogleIdentityProvider
      const authorizationUrl = yield* google.authorizationUrl({ intent: "login", state: "state", nonce: "nonce" })
      const identity = yield* google.exchangeCallback({ code: "ok", state: "state" })
      return { authorizationUrl, identity }
    }).pipe(Effect.provide(layer)))
    expect(result.authorizationUrl).toBe("/es?code=ok&state=state")
    expect(result.identity).toMatchObject({ subject: "g-1", nonce: "nonce" })
  })

  it("rejects a code/state pair that was not issued", async () => {
    const error = await Effect.runPromise(Effect.gen(function*() {
      return yield* Effect.flip((yield* GoogleIdentityProvider).exchangeCallback({ code: "missing", state: "state" }))
    }).pipe(Effect.provide(makeFakeGoogleIdentityProvider([]))))
    expect(error).toBeInstanceOf(GoogleIdentityRejected)
  })
})
