import {
  AuthChallengeNotFound,
  AuthChallengeRepository,
  AuthRepositoryError,
  InvalidRepositoryState,
  UserConflict,
  UserNotFound,
  UserRepository,
  type AuthChallenge,
  type AuthChallengePurpose,
  type User,
  type UserId,
} from "@proxus/backend-domain/auth"
import { Effect, Layer, Option, Ref } from "effect"

const conflictsWith = (candidate: User, current: User): UserConflict["field"] | undefined => {
  if (candidate.email === current.email) return "email"
  if (candidate.usernameNormalized === current.usernameNormalized) return "username"
  if (candidate.googleSubject !== null && candidate.googleSubject === current.googleSubject) return "google-subject"
  return undefined
}

/** Fresh, concurrency-safe memory adapter. Ref.modify makes checks and writes indivisible. */
export const makeAuthUserRepositoryMemory = (initial: ReadonlyArray<User> = []) =>
  Layer.effect(UserRepository, Effect.gen(function*() {
    const state = yield* Ref.make(new Map(initial.map((user) => [user.id, user])))
    const create = (user: User) => Ref.modify(state, (users): readonly [User | UserConflict, Map<UserId, User>] => {
      const field = [...users.values()].map((current) => conflictsWith(user, current)).find((value) => value !== undefined)
      return field === undefined ? [user, new Map(users).set(user.id, user)] : [new UserConflict({ field }), users]
    }).pipe(Effect.flatMap((result) => result instanceof UserConflict ? Effect.fail(result) : Effect.succeed(result)))
    const update = (id: UserId, change: (user: User) => User) => Ref.modify(state, (users): readonly [User | UserNotFound, Map<UserId, User>] => {
      const user = users.get(id)
      if (user === undefined) return [new UserNotFound({ userId: id }), users]
      const next = change(user)
      return [next, new Map(users).set(id, next)]
    }).pipe(Effect.flatMap((result) => result instanceof UserNotFound ? Effect.fail(result) : Effect.succeed(result)))

    return UserRepository.of({
      createPending: create,
      createGoogleActive: create,
      findByEmail: (email) => Ref.get(state).pipe(Effect.map((users) => Option.fromUndefinedOr([...users.values()].find((user) => user.email === email)))),
      findByGoogleSubject: (subject) => Ref.get(state).pipe(Effect.map((users) => Option.fromUndefinedOr([...users.values()].find((user) => user.googleSubject === subject)))),
      linkGoogle: (id, subject, linkedAt) => Ref.modify(state, (users): readonly [User | UserNotFound | InvalidRepositoryState | UserConflict, Map<UserId, User>] => {
        const user = users.get(id)
        if (user === undefined) return [new UserNotFound({ userId: id }), users]
        if (user.status !== "active" || user.emailVerifiedAt === null) return [new InvalidRepositoryState({ entity: "user" }), users]
        if ([...users.values()].some((current) => current.id !== id && current.googleSubject === subject)) return [new UserConflict({ field: "google-subject" }), users]
        const linked = { ...user, googleSubject: subject, updatedAt: linkedAt }
        return [linked, new Map(users).set(id, linked)]
      }).pipe(Effect.flatMap((result) => result instanceof UserNotFound || result instanceof InvalidRepositoryState || result instanceof UserConflict ? Effect.fail(result) : Effect.succeed(result))),
      getById: (id) => Ref.get(state).pipe(Effect.map((users) => Option.fromUndefinedOr(users.get(id)))),
      activate: (id, verifiedAt) => Ref.modify(state, (users): readonly [User | UserNotFound | InvalidRepositoryState, Map<UserId, User>] => {
        const user = users.get(id)
        if (user === undefined) return [new UserNotFound({ userId: id }), users]
        if (user.status !== "pending") return [new InvalidRepositoryState({ entity: "user" }), users]
        const active: User = { ...user, status: "active", emailVerifiedAt: verifiedAt, updatedAt: verifiedAt }
        return [active, new Map(users).set(id, active)]
      }).pipe(Effect.flatMap((result) => result instanceof UserNotFound || result instanceof InvalidRepositoryState ? Effect.fail(result) : Effect.succeed(result))),
      disable: (id, disabledAt) => update(id, (user) => ({ ...user, status: "disabled", updatedAt: disabledAt })),
      usernameExists: (username) => Ref.get(state).pipe(Effect.map((users) => [...users.values()].some((user) => user.usernameNormalized === username))),
      updatePasswordHash: (id, passwordHash, updatedAt) => update(id, (user) => ({ ...user, passwordHash, updatedAt })),
    })
  }))

const isActive = (challenge: AuthChallenge, userId: UserId, purpose: AuthChallengePurpose, now: Date) =>
  challenge.userId === userId && challenge.purpose === purpose && challenge.consumedAt === null &&
  challenge.expiresAt > now && challenge.failedAttempts < challenge.maximumAttempts

export const makeAuthChallengeRepositoryMemory = (initial: ReadonlyArray<AuthChallenge> = []) =>
  Layer.effect(AuthChallengeRepository, Effect.gen(function*() {
    const state = yield* Ref.make(new Map(initial.map((challenge) => [challenge.id, challenge])))
    const latest = (challenges: Map<AuthChallenge["id"], AuthChallenge>, userId: UserId, purpose: AuthChallengePurpose) =>
      [...challenges.values()].filter((challenge) => challenge.userId === userId && challenge.purpose === purpose)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))[0]
    return AuthChallengeRepository.of({
      issue: (challenge) => Ref.modify(state, (challenges): readonly [AuthChallenge | AuthRepositoryError, Map<AuthChallenge["id"], AuthChallenge>] => {
        if (challenges.has(challenge.id)) {
          return [new AuthRepositoryError({ operation: "issueChallenge", cause: new Error("duplicate challenge id") }), challenges]
        }
        const revoked = new Map([...challenges].map(([id, current]) => [id,
          current.userId === challenge.userId && current.purpose === challenge.purpose && current.consumedAt === null
            ? { ...current, consumedAt: challenge.createdAt }
            : current,
        ]))
        revoked.set(challenge.id, challenge)
        return [challenge, revoked]
      }).pipe(Effect.flatMap((result) => result instanceof AuthRepositoryError ? Effect.fail(result) : Effect.succeed(result))),
      findLatest: (userId, purpose, now) => Ref.get(state).pipe(Effect.map((challenges) => {
        const challenge = latest(challenges, userId, purpose)
        if (challenge === undefined) return { _tag: "Missing" } as const
        if (challenge.consumedAt !== null) return { _tag: "Used", challenge } as const
        if (challenge.expiresAt <= now) return { _tag: "Expired", challenge } as const
        if (challenge.failedAttempts >= challenge.maximumAttempts) return { _tag: "AttemptsExceeded", challenge } as const
        return { _tag: "Active", challenge } as const
      })),
      findActive: (userId, purpose, now) => Ref.get(state).pipe(Effect.map((challenges) => Option.fromUndefinedOr(
        [...challenges.values()].filter((challenge) => isActive(challenge, userId, purpose, now)).sort((a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
        )[0],
      ))),
      recordFailure: (id) => Ref.modify(state, (challenges): readonly [AuthChallenge | AuthChallengeNotFound, Map<AuthChallenge["id"], AuthChallenge>] => {
        const current = challenges.get(id)
        if (current === undefined) return [new AuthChallengeNotFound(), challenges]
        const next = { ...current, failedAttempts: Math.min(current.maximumAttempts, current.failedAttempts + 1) }
        return [next, new Map(challenges).set(id, next)]
      }).pipe(Effect.flatMap((result) => result instanceof AuthChallengeNotFound ? Effect.fail(result) : Effect.succeed(result))),
      consume: (id, consumedAt) => Ref.modify(state, (challenges): readonly [AuthChallengeNotFound | InvalidRepositoryState | undefined, Map<AuthChallenge["id"], AuthChallenge>] => {
        const current = challenges.get(id)
        if (current === undefined) return [new AuthChallengeNotFound(), challenges]
        if (current.consumedAt !== null || current.expiresAt <= consumedAt || current.failedAttempts >= current.maximumAttempts) {
          return [new InvalidRepositoryState({ entity: "challenge" }), challenges]
        }
        return [undefined, new Map(challenges).set(id, { ...current, consumedAt })]
      }).pipe(Effect.flatMap((error) => error === undefined ? Effect.void : Effect.fail(error))),
      revokePurpose: (userId, purpose, revokedAt) => Ref.update(state, (challenges) => new Map([...challenges].map(([id, challenge]) => [id,
        challenge.userId === userId && challenge.purpose === purpose && challenge.consumedAt === null ? { ...challenge, consumedAt: revokedAt } : challenge,
      ]))),
    })
  }))
