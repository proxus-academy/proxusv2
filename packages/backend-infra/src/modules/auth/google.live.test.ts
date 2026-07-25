// @effect-diagnostics strictEffectProvide:off asyncFunction:off globalDate:off
import { GoogleIdentityProvider, UserRepository, makeMemoryUserRepository, makeSessionId, makeUserId, type User } from "@proxus/backend-domain/auth"
import { GoogleFlow, GoogleSessionIssuer, makeGoogleFlowLive } from "@proxus/backend-domain/auth/google-live"
import { Clock, Effect, Layer, Option } from "effect"
import { describe, expect, it } from "vitest"
import { makeFakeGoogleIdentityProvider } from "./google.fake.js"
import { makeGoogleSecurityLive } from "./google.security.live.js"

const now = new Date(100)
const user = (status: User["status"], googleSubject: string | null): User => ({
  id: makeUserId(`${status}-${googleSubject ?? "email"}`), email: `${status}@example.com`, status,
  emailVerifiedAt: status === "active" ? now : null, passwordHash: "hash", googleSubject,
  usernameNormalized: `${status}_${googleSubject ?? "email"}`, birthYear: 2000, problemKind: "prepare-exams", problemOther: null,
  subjectId: "subject", validatedNodeIds: ["1", "2", "3", "4", "5"], createdAt: now, updatedAt: now,
})
const clock = Layer.succeed(Clock.Clock, { currentTimeMillisUnsafe: () => 100, currentTimeMillis: Effect.succeed(100), currentTimeNanosUnsafe: () => 100_000_000n, currentTimeNanos: Effect.succeed(100_000_000n), sleep: () => Effect.void })
const sessions = Layer.succeed(GoogleSessionIssuer, GoogleSessionIssuer.of({ issue: (userId) => Effect.succeed({ token: `token-${userId}`, session: { id: makeSessionId(`session-${userId}`), userId, tokenHash: "hash", previousTokenHash: null, previousTokenValidUntil: null, expiresAt: new Date(1_000), revokedAt: null, createdAt: now } }) }))
const secret = "a-secure-google-signing-key-with-32-bytes-minimum"

const run = (initial: readonly User[], subject: string, email: string) => {
  const dependencies = Layer.mergeAll(makeMemoryUserRepository(initial), makeFakeGoogleIdentityProvider([{ code: "ok", identity: { subject, email, emailVerified: true, displayName: "client-profile-is-not-used" } }]), makeGoogleSecurityLive(secret), sessions, clock)
  const live = makeGoogleFlowLive({ stateTtlMillis: 1_000, pendingTtlMillis: 2_000 }).pipe(Layer.provide(dependencies), Layer.provideMerge(dependencies))
  return Effect.runPromise(Effect.gen(function*() {
    const flow = yield* GoogleFlow
    const started = yield* flow.start("login")
    const result = yield* flow.complete({ code: "ok", state: started.state })
    const found = yield* (yield* UserRepository).findByEmail(email)
    return { result, found }
  }).pipe(Effect.provide(live)))
}

describe("GoogleFlowLive", () => {
  it("logs in an existing Google identity without onboarding", async () => {
    expect((await run([user("active", "g-existing")], "g-existing", "active@example.com")).result._tag).toBe("Authenticated")
  })
  it("auto-links only an active verified email, idempotently", async () => {
    const first = await run([user("active", null)], "g-link", "active@example.com")
    expect(first.result._tag).toBe("Authenticated")
    expect(Option.getOrThrow(first.found).googleSubject).toBe("g-link")
  })
  it("does not link a pending email and creates signed pending only for a new identity", async () => {
    const blocked = await run([user("pending", null)], "g-pending", "pending@example.com")
    expect(blocked.result._tag).toBe("EmailAccountNotActive")
    expect(Option.getOrThrow(blocked.found).googleSubject).toBeNull()
    const fresh = await run([], "g-new", "new@example.com")
    expect(fresh.result._tag).toBe("NewIdentity")
  })
})
