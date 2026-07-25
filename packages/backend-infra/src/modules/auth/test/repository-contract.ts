// @effect-diagnostics asyncFunction:off globalDate:off
import {
  AuthChallengeRepository,
  AuthChallengeNotFound,
  InvalidRepositoryState,
  UserConflict,
  UserNotFound,
  UserRepository,
  type AuthChallenge,
  type AuthChallengeId,
  type User,
  type UserId,
} from "@proxus/backend-domain/auth"
import { Effect, Option } from "effect"
import { expect, test } from "vitest"

const at = (value: string) => new Date(value)
export const subjectId = "00000000-0000-4000-8000-000000000005"
const user = (n: number, overrides: Partial<User> = {}): User => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}` as UserId,
  email: `user${n}@example.com`, status: "pending", emailVerifiedAt: null, passwordHash: "hash",
  googleSubject: null, usernameNormalized: `user_${n}`, birthYear: 2000,
  problemKind: "organize-study", problemOther: null, subjectId,
  validatedNodeIds: [
    "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002",
    "00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000004", subjectId,
  ], createdAt: at("2026-01-01T00:00:00Z"), updatedAt: at("2026-01-01T00:00:00Z"), ...overrides,
})
const challenge = (n: number, purpose: AuthChallenge["purpose"] = "verify-email"): AuthChallenge => ({
  id: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}` as AuthChallengeId,
  userId: user(1).id, purpose, codeHash: `hash-${n}`, createdAt: at(`2026-01-01T00:0${n}:00Z`),
  expiresAt: at("2026-01-01T01:00:00Z"), failedAttempts: 0, maximumAttempts: 2, consumedAt: null,
})

export type RepositoryContractRun = <A, E>(effect: Effect.Effect<A, E, UserRepository | AuthChallengeRepository>) => Promise<A>
export const authRepositoryContract = (label: string, makeRun: () => Promise<RepositoryContractRun>) => {
  test(`${label}: resolves concurrent email and username races with typed conflicts`, async () => {
    const run = await makeRun()
    const results = await Promise.allSettled([
      run(Effect.gen(function*() { return yield* (yield* UserRepository).createPending(user(1)) })),
      run(Effect.gen(function*() { return yield* (yield* UserRepository).createPending(user(2, { email: user(1).email })) })),
    ])
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    const rejected = results.find((result) => result.status === "rejected")
    if (rejected?.status !== "rejected") throw new Error("Expected one rejected creation")
    expect(rejected.reason).toBeInstanceOf(UserConflict)
    if (!(rejected.reason instanceof UserConflict)) throw new Error("Expected UserConflict")
    expect(rejected.reason.field).toBe("email")

    await run(Effect.gen(function*() { return yield* (yield* UserRepository).createPending(user(3)) }))
    await expect(run(Effect.gen(function*() { return yield* (yield* UserRepository).createPending(user(4, { usernameNormalized: user(3).usernameNormalized })) })))
      .rejects.toMatchObject({ _tag: "UserConflict", field: "username" })
  })

  test(`${label}: round-trips user lifecycle and classifies every unique conflict`, async () => {
    const run = await makeRun()
    await run(Effect.gen(function*() {
      const users = yield* UserRepository
      const pending = yield* users.createPending(user(10))
      expect(Option.getOrThrow(yield* users.findByEmail(pending.email))).toEqual(pending)
      expect(Option.getOrThrow(yield* users.getById(pending.id))).toEqual(pending)
      expect(yield* users.usernameExists(pending.usernameNormalized)).toBe(true)

      const activatedAt = at("2026-01-02T00:00:00Z")
      const active = yield* users.activate(pending.id, activatedAt)
      expect(active).toMatchObject({ status: "active", emailVerifiedAt: activatedAt })
      expect((yield* Effect.flip(users.activate(pending.id, activatedAt)))).toBeInstanceOf(InvalidRepositoryState)
      const passwordUpdated = yield* users.updatePasswordHash(pending.id, "next-hash", at("2026-01-03T00:00:00Z"))
      expect(passwordUpdated.passwordHash).toBe("next-hash")
      expect((yield* users.disable(pending.id, at("2026-01-04T00:00:00Z"))).status).toBe("disabled")
      expect((yield* Effect.flip(users.activate(user(99).id, activatedAt)))).toBeInstanceOf(UserNotFound)

      yield* users.createGoogleActive(user(11, { status: "active", googleSubject: "google-11" }))
      expect((yield* Effect.flip(users.createGoogleActive(user(12, { googleSubject: "google-11" }))))).toMatchObject({
        _tag: "UserConflict", field: "google-subject",
      })
    }))
  })

  test(`${label}: challenge issuance is transactional and isolates purposes`, async () => {
    const run = await makeRun()
    await run(Effect.gen(function*() {
      const users = yield* UserRepository
      const challenges = yield* AuthChallengeRepository
      yield* users.createPending(user(1))
      yield* challenges.issue(challenge(1))
      yield* challenges.issue(challenge(3, "reset-password"))
      yield* Effect.flip(challenges.issue({ ...challenge(1), createdAt: at("2026-01-01T00:04:00Z") }))
      expect(Option.getOrThrow(yield* challenges.findActive(user(1).id, "verify-email", at("2026-01-01T00:30:00Z"))).id).toBe(challenge(1).id)
      expect(Option.getOrThrow(yield* challenges.findActive(user(1).id, "reset-password", at("2026-01-01T00:30:00Z"))).id).toBe(challenge(3).id)
      expect((yield* Effect.flip(challenges.recordFailure(challenge(99).id)))).toBeInstanceOf(AuthChallengeNotFound)
    }))
  })

  test(`${label}: concurrent issuance leaves one active challenge per purpose`, async () => {
    const run = await makeRun()
    await run(Effect.gen(function*() { yield* (yield* UserRepository).createPending(user(1)) }))
    await Promise.all([
      run(Effect.gen(function*() { yield* (yield* AuthChallengeRepository).issue(challenge(4)) })),
      run(Effect.gen(function*() { yield* (yield* AuthChallengeRepository).issue(challenge(5)) })),
    ])
    const active = await run(Effect.gen(function*() {
      return yield* (yield* AuthChallengeRepository).findActive(user(1).id, "verify-email", at("2026-01-01T00:30:00Z"))
    }))
    expect(Option.isSome(active)).toBe(true)
    const outcomes = await Promise.allSettled([
      run(Effect.gen(function*() { yield* (yield* AuthChallengeRepository).consume(challenge(4).id, at("2026-01-01T00:30:00Z")) })),
      run(Effect.gen(function*() { yield* (yield* AuthChallengeRepository).consume(challenge(5).id, at("2026-01-01T00:30:00Z")) })),
    ])
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1)
  })

  test(`${label}: challenges are purpose-bound, expire, exhaust attempts, and consume once`, async () => {
    const run = await makeRun()
    await run(Effect.gen(function*() {
      const users = yield* UserRepository
      const challenges = yield* AuthChallengeRepository
      yield* users.createPending(user(1))
      yield* challenges.issue(challenge(1, "verify-email"))
      expect(Option.isNone(yield* challenges.findActive(user(1).id, "reset-password", at("2026-01-01T00:30:00Z")))).toBe(true)
      expect(Option.isNone(yield* challenges.findActive(user(1).id, "verify-email", at("2026-01-01T02:00:00Z")))).toBe(true)
      yield* challenges.recordFailure(challenge(1).id)
      yield* challenges.recordFailure(challenge(1).id)
      expect(Option.isNone(yield* challenges.findActive(user(1).id, "verify-email", at("2026-01-01T00:30:00Z")))).toBe(true)
      yield* challenges.issue(challenge(2, "verify-email"))
    }))
    const consumed = await Promise.allSettled([
      run(Effect.gen(function*() { yield* (yield* AuthChallengeRepository).consume(challenge(2).id, at("2026-01-01T00:30:00Z")) })),
      run(Effect.gen(function*() { yield* (yield* AuthChallengeRepository).consume(challenge(2).id, at("2026-01-01T00:30:00Z")) })),
    ])
    expect(consumed.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    const rejected = consumed.find((result) => result.status === "rejected")
    expect(rejected?.status === "rejected" ? rejected.reason : undefined).toBeInstanceOf(InvalidRepositoryState)
  })
}
