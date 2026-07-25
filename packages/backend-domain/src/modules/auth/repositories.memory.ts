import { Effect, Layer, Option, Ref } from "effect"
import type { AuthChallenge, AuthChallengePurpose, AuthSession, SessionRotation, User, UserId } from "./model.js"
import { AuthChallengeNotFound, AuthChallengeRepository, InvalidRepositoryState, SessionNotFound, SessionRepository, UserConflict, UserNotFound, UserRepository } from "./repositories.js"

export const makeMemoryUserRepository = (initial: ReadonlyArray<User> = []) => Layer.effect(UserRepository, Effect.gen(function* () {
  const users = yield* Ref.make(new Map(initial.map((user) => [user.id, user])))
  const create = (user: User) => Effect.gen(function* () {
    const all = yield* Ref.get(users)
    if ([...all.values()].some((existing) => existing.email === user.email)) return yield* new UserConflict({ field: "email" })
    yield* Ref.update(users, (current) => new Map(current).set(user.id, user))
    return user
  })
  const update = (id: UserId, f: (user: User) => User) => Effect.gen(function* () {
    const all = yield* Ref.get(users)
    const current = all.get(id)
    if (current === undefined) return yield* new UserNotFound({ userId: id })
    const next = f(current)
    yield* Ref.update(users, (value) => new Map(value).set(id, next))
    return next
  })
  return UserRepository.of({
    createPending: create, createGoogleActive: create,
    findByEmail: (email) => Ref.get(users).pipe(Effect.map((all) => Option.fromUndefinedOr([...all.values()].find((u) => u.email === email)))),
    findByGoogleSubject: (subject) => Ref.get(users).pipe(Effect.map((all) => Option.fromUndefinedOr([...all.values()].find((u) => u.googleSubject === subject)))),
    linkGoogle: (id, subject, now) => Effect.gen(function* () {
      const all = yield* Ref.get(users)
      const current = all.get(id)
      if (current === undefined) return yield* new UserNotFound({ userId: id })
      if (current.status !== "active" || current.emailVerifiedAt === null) return yield* new InvalidRepositoryState({ entity: "user" })
      if ([...all.values()].some((u) => u.id !== id && u.googleSubject === subject)) return yield* new UserConflict({ field: "google-subject" })
      const next = { ...current, googleSubject: subject, updatedAt: now }
      yield* Ref.update(users, (value) => new Map(value).set(id, next)); return next
    }),
    getById: (id) => Ref.get(users).pipe(Effect.map((all) => Option.fromUndefinedOr(all.get(id)))),
    activate: (id, now) => update(id, (user) => ({ ...user, status: "active", emailVerifiedAt: now, updatedAt: now })),
    disable: (id, now) => update(id, (user) => ({ ...user, status: "disabled", updatedAt: now })),
    usernameExists: () => Effect.succeed(false),
    updatePasswordHash: (id, passwordHash, now) => update(id, (user) => ({ ...user, passwordHash, updatedAt: now })),
  })
}))

export const makeMemorySessionRepository = (initial: ReadonlyArray<AuthSession> = []) => Layer.effect(SessionRepository, Effect.gen(function* () {
  const sessions = yield* Ref.make(new Map(initial.map((session) => [session.id, session])))
  return SessionRepository.of({
    create: (session) => Ref.update(sessions, (all) => new Map(all).set(session.id, session)).pipe(Effect.as(session)),
    findActiveByTokenHash: (hash, now) => Ref.get(sessions).pipe(Effect.map((all) => Option.fromUndefinedOr([...all.values()].find((s) => s.revokedAt === null && s.expiresAt > now && (s.tokenHash === hash || (s.previousTokenHash === hash && s.previousTokenValidUntil !== null && s.previousTokenValidUntil > now)))))),
    rotate: (input) => Ref.modify<Map<AuthSession["id"], AuthSession>, SessionRotation>(sessions, (all) => {
      const found = all.get(input.id)
      if (found === undefined || found.revokedAt !== null || found.expiresAt <= input.now) return [{ _tag: "NotActive" } as const, all]
      if (found.tokenHash === input.presentedTokenHash) {
        const next = { ...found, tokenHash: input.nextTokenHash, previousTokenHash: found.tokenHash, previousTokenValidUntil: input.previousTokenValidUntil, expiresAt: input.expiresAt }
        return [{ _tag: "Rotated", session: next } as const, new Map(all).set(input.id, next)]
      }
      if (found.previousTokenHash === input.presentedTokenHash && found.previousTokenValidUntil !== null && found.previousTokenValidUntil > input.now) {
        return [{ _tag: "AlreadyRotated", session: found } as const, all]
      }
      return [{ _tag: "NotActive" } as const, all]
    }),
    revoke: (id, now) => Effect.gen(function* () {
      const all = yield* Ref.get(sessions); const found = all.get(id)
      if (found === undefined) return yield* new SessionNotFound()
      yield* Ref.update(sessions, (value) => new Map(value).set(id, { ...found, revokedAt: now }))
    }),
    revokeAllForAccount: (userId, now) => Ref.update(sessions, (all) => new Map([...all].map(([id, session]) => [id, session.userId === userId ? { ...session, revokedAt: now } : session]))),
  })
}))

export const makeMemoryAuthChallengeRepository = (initial: ReadonlyArray<AuthChallenge> = []) => Layer.effect(AuthChallengeRepository, Effect.gen(function* () {
  const challenges = yield* Ref.make(new Map(initial.map((challenge) => [challenge.id, challenge])))
  const active = (challenge: AuthChallenge, userId: UserId, purpose: AuthChallengePurpose, now: Date) => challenge.userId === userId && challenge.purpose === purpose && challenge.consumedAt === null && challenge.expiresAt > now && challenge.failedAttempts < challenge.maximumAttempts
  return AuthChallengeRepository.of({
    issue: (challenge) => Ref.update(challenges, (all) => new Map(all).set(challenge.id, challenge)).pipe(Effect.as(challenge)),
    findLatest: (userId, purpose, now) => Ref.get(challenges).pipe(Effect.map((all) => {
      const challenge = [...all.values()].filter((item) => item.userId === userId && item.purpose === purpose).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
      if (challenge === undefined) return { _tag: "Missing" } as const
      if (challenge.consumedAt !== null) return { _tag: "Used", challenge } as const
      if (challenge.expiresAt <= now) return { _tag: "Expired", challenge } as const
      if (challenge.failedAttempts >= challenge.maximumAttempts) return { _tag: "AttemptsExceeded", challenge } as const
      return { _tag: "Active", challenge } as const
    })),
    findActive: (userId, purpose, now) => Ref.get(challenges).pipe(Effect.map((all) => Option.fromUndefinedOr([...all.values()].find((c) => active(c, userId, purpose, now))))),
    recordFailure: (id) => Effect.gen(function* () {
      const all = yield* Ref.get(challenges); const found = all.get(id)
      if (found === undefined) return yield* new AuthChallengeNotFound()
      const next = { ...found, failedAttempts: found.failedAttempts + 1 }
      yield* Ref.update(challenges, (value) => new Map(value).set(id, next)); return next
    }),
    consume: (id, now) => Effect.gen(function* () {
      const all = yield* Ref.get(challenges); const found = all.get(id)
      if (found === undefined) return yield* new AuthChallengeNotFound()
      if (found.consumedAt !== null) return yield* new InvalidRepositoryState({ entity: "challenge" })
      yield* Ref.update(challenges, (value) => new Map(value).set(id, { ...found, consumedAt: now }))
    }),
    revokePurpose: (userId, purpose, now) => Ref.update(challenges, (all) => new Map([...all].map(([id, challenge]) => [id, challenge.userId === userId && challenge.purpose === purpose && challenge.consumedAt === null ? { ...challenge, consumedAt: now } : challenge]))),
  })
}))
