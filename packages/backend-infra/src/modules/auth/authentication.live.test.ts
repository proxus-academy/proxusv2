// @effect-diagnostics strictEffectProvide:off globalDate:off globalDateInEffect:off asyncFunction:off
import { describe, expect, it } from "vitest"
import { Effect, Layer } from "effect"
import {
  AuthenticationService,
  type AuthenticationError,
  EmailDelivery,
  Passwords,
  VerificationCodeGenerator,
  makeMemoryAuthChallengeRepository,
  makeMemorySessionRepository,
  makeMemoryUserRepository,
  makeUser,
  makeUserId,
  type AuthChallenge,
  type AuthEmailMessage,
  type User,
} from "@proxus/backend-domain/auth"
import { makeAuthenticationLive } from "./authentication.live.js"
import { makeOpaqueSessionsLive } from "./sessions.js"

const now = new Date()
const user = (status: User["status"] = "active"): User => makeUser({
  id: makeUserId(`user-${status}`), email: `${status}@example.test`, status,
  emailVerifiedAt: status === "active" ? now : null, passwordHash: "hash:secret", googleSubject: null,
  usernameNormalized: status, birthYear: 2000, problemKind: "organize-study", problemOther: null,
  acquisitionSource: "friend", acquisitionOther: null,
  studyId: "study", subjectId: "subject", createdAt: now, updatedAt: now,
})

const passwordLayer = Layer.succeed(Passwords, Passwords.of({
  hash: (value) => Effect.succeed(`hash:${value}`),
  verify: (value, hash) => Effect.succeed(hash === `hash:${value}`),
}))
const codeLayer = Layer.succeed(VerificationCodeGenerator, VerificationCodeGenerator.of({ generate: () => Effect.succeed("654321") }))

const testLayer = (users: ReadonlyArray<User>, delivered: Array<AuthEmailMessage>, initialChallenges: ReadonlyArray<AuthChallenge> = []) => {
  const userRepository = makeMemoryUserRepository(users)
  const sessionRepository = makeMemorySessionRepository()
  const challengeRepository = makeMemoryAuthChallengeRepository(initialChallenges)
  const emailLayer = Layer.succeed(EmailDelivery, EmailDelivery.of({
    sendVerification: () => Effect.void,
    sendPasswordReset: (message) => Effect.sync(() => { delivered.push(message) }),
  }))
  const opaque = makeOpaqueSessionsLive({ ttlMillis: 60_000, renewalWindowMillis: 1_000, rotationGraceMillis: 100 }).pipe(
    Layer.provide(sessionRepository),
  )
  const dependencies = Layer.mergeAll(userRepository, sessionRepository, challengeRepository, passwordLayer, codeLayer, emailLayer, opaque)
  return makeAuthenticationLive({ passwordResetTtlMillis: 60_000, passwordResetMaximumAttempts: 3 }).pipe(Layer.provide(dependencies))
}

const run = <A, E>(effect: Effect.Effect<A, E, AuthenticationService>, layer: Layer.Layer<AuthenticationService>) =>
  Effect.runPromise(effect.pipe(Effect.provide(layer)))

const failureTag = (effect: Effect.Effect<unknown, AuthenticationError, AuthenticationService>, layer: Layer.Layer<AuthenticationService>) =>
  Effect.runPromise(effect.pipe(
    Effect.match({ onFailure: (failure) => failure._tag, onSuccess: () => undefined }),
    Effect.provide(layer),
  ))

describe("AuthenticationService live", () => {
  it("logs in, resolves the current session and logs out", async () => {
    const layer = testLayer([user()], [])
    const result = await run(Effect.gen(function*() {
      const service = yield* AuthenticationService
      const issued = yield* service.loginWithPassword({ email: " ACTIVE@EXAMPLE.TEST ", password: "secret" })
      const current = yield* service.currentSession(issued.token)
      yield* service.logout(issued.token)
      const afterLogout = yield* Effect.exit(service.currentSession(issued.token))
      return { current, afterLogout }
    }), layer)
    expect(result.current.session.userId).toBe(user().id)
    expect(result.afterLogout._tag).toBe("Failure")
  })

  it("uses generic credentials failures for unknown, wrong, pending and disabled accounts", async () => {
    const layer = testLayer([user("pending"), user("disabled")], [])
    for (const input of [
      { email: "missing@example.test", password: "secret" },
      { email: "pending@example.test", password: "secret" },
      { email: "disabled@example.test", password: "secret" },
      { email: "pending@example.test", password: "wrong" },
    ]) expect(await failureTag(Effect.flatMap(AuthenticationService, (_) => _.loginWithPassword(input)), layer)).toBe("InvalidCredentials")
  })

  it("does not enumerate reset requests for absent, pending or disabled accounts", async () => {
    const delivered: Array<AuthEmailMessage> = []
    const layer = testLayer([user("pending"), user("disabled")], delivered)
    for (const email of ["missing@example.test", "pending@example.test", "disabled@example.test"]) {
      await run(Effect.flatMap(AuthenticationService, (_) => _.requestPasswordReset(email)), layer)
    }
    expect(delivered).toEqual([])
  })

  it("issues only reset-password challenges and rejects another purpose", async () => {
    const account = user()
    const verification: AuthChallenge = {
      id: "verify" as AuthChallenge["id"], userId: account.id, purpose: "verify-email", codeHash: "hash:654321",
      expiresAt: new Date(Date.now() + 60_000), failedAttempts: 0, maximumAttempts: 3, consumedAt: null, createdAt: now,
    }
    const delivered: Array<AuthEmailMessage> = []
    const layer = testLayer([account], delivered, [verification])
    expect(await failureTag(Effect.flatMap(AuthenticationService, (_) => _.resetPassword(account.email, "654321", "new")), layer)).toBe("InvalidVerificationCode")
    await run(Effect.flatMap(AuthenticationService, (_) => _.requestPasswordReset(account.email)), layer)
    expect(delivered).toMatchObject([{ purpose: "reset-password", code: "654321" }])
  })

  it("changes the password and globally invalidates prior sessions", async () => {
    const account = user()
    const delivered: Array<AuthEmailMessage> = []
    const layer = testLayer([account], delivered)
    const auth = await run(Effect.gen(function*() {
      const service = yield* AuthenticationService
      const first = yield* service.loginWithPassword({ email: account.email, password: "secret" })
      const second = yield* service.loginWithPassword({ email: account.email, password: "secret" })
      yield* service.requestPasswordReset(account.email)
      yield* service.resetPassword(account.email, "654321", "new-secret")
      return { service, first, second }
    }), layer)
    expect(await failureTag(auth.service.currentSession(auth.first.token), layer)).toBe("UnauthorizedSession")
    expect(await failureTag(auth.service.currentSession(auth.second.token), layer)).toBe("UnauthorizedSession")
    await Effect.runPromise(auth.service.loginWithPassword({ email: account.email, password: "new-secret" }))
  })
})
