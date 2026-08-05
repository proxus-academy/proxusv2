import { Context, Data, Effect, Option } from "effect"
import type { AuthChallenge, AuthChallengePurpose, AuthSession, IssuedSession, SessionId, SessionRotation, User, UserId } from "./model.js"

export class AuthRepositoryError extends Data.TaggedError("AuthRepositoryError")<{
  readonly operation: string
  readonly cause?: unknown
}> {}
export class UserConflict extends Data.TaggedError("UserConflict")<{
  readonly field: "email" | "google-subject" | "username"
}> {}
export class UserNotFound extends Data.TaggedError("UserNotFound")<{ readonly userId?: UserId }> {}
export class SessionNotFound extends Data.TaggedError("SessionNotFound")<{}> {}
export class AuthChallengeNotFound extends Data.TaggedError("AuthChallengeNotFound")<{}> {}

export class UserRepository extends Context.Service<UserRepository, {
  readonly createPending: (user: User) => Effect.Effect<User, UserConflict | AuthRepositoryError>
  readonly createGoogleActive: (user: User) => Effect.Effect<User, UserConflict | AuthRepositoryError>
  readonly findByEmail: (normalizedEmail: string) => Effect.Effect<Option.Option<User>, AuthRepositoryError>
  readonly findByGoogleSubject: (subject: string) => Effect.Effect<Option.Option<User>, AuthRepositoryError>
  /** Atomically links only an active, email-verified account. */
  readonly linkGoogle: (id: UserId, subject: string, linkedAt: Date) => Effect.Effect<User, UserConflict | InvalidRepositoryState | UserNotFound | AuthRepositoryError>
  readonly getById: (id: UserId) => Effect.Effect<Option.Option<User>, AuthRepositoryError>
  readonly listAll: () => Effect.Effect<ReadonlyArray<User>, AuthRepositoryError>
  readonly activate: (id: UserId, verifiedAt: Date) => Effect.Effect<User, UserNotFound | InvalidRepositoryState | AuthRepositoryError>
  readonly disable: (id: UserId, disabledAt: Date) => Effect.Effect<User, UserNotFound | AuthRepositoryError>
  readonly enable: (id: UserId, enabledAt: Date) => Effect.Effect<User, UserNotFound | InvalidRepositoryState | AuthRepositoryError>
  readonly usernameExists: (normalizedUsername: string) => Effect.Effect<boolean, AuthRepositoryError>
  readonly updatePasswordHash: (id: UserId, passwordHash: string, updatedAt: Date) => Effect.Effect<User, UserNotFound | AuthRepositoryError>
}>()("@proxus/backend-domain/modules/auth/repositories/UserRepository") {}

export class InvalidRepositoryState extends Data.TaggedError("InvalidRepositoryState")<{
  readonly entity: "user" | "session" | "challenge"
}> {}

export class SessionRepository extends Context.Service<SessionRepository, {
  readonly create: (session: AuthSession) => Effect.Effect<AuthSession, AuthRepositoryError>
  readonly findActiveByTokenHash: (tokenHash: string, now: Date) => Effect.Effect<Option.Option<AuthSession>, AuthRepositoryError>
  /** Compare-and-swap rotation. A concurrent loser observes AlreadyRotated during grace. */
  readonly rotate: (input: {
    readonly id: SessionId
    readonly presentedTokenHash: string
    readonly nextTokenHash: string
    readonly expiresAt: Date
    readonly now: Date
    readonly previousTokenValidUntil: Date
  }) => Effect.Effect<SessionRotation, AuthRepositoryError>
  readonly revoke: (id: SessionId, revokedAt: Date) => Effect.Effect<void, SessionNotFound | AuthRepositoryError>
  readonly revokeAllForAccount: (userId: UserId, revokedAt: Date) => Effect.Effect<void, AuthRepositoryError>
}>()("@proxus/backend-domain/modules/auth/repositories/SessionRepository") {}

export type ChallengeLookup =
  | { readonly _tag: "Missing" }
  | { readonly _tag: "Active"; readonly challenge: AuthChallenge }
  | { readonly _tag: "Expired"; readonly challenge: AuthChallenge }
  | { readonly _tag: "Used"; readonly challenge: AuthChallenge }
  | { readonly _tag: "AttemptsExceeded"; readonly challenge: AuthChallenge }

export class AuthChallengeRepository extends Context.Service<AuthChallengeRepository, {
  readonly issue: (challenge: AuthChallenge) => Effect.Effect<AuthChallenge, AuthRepositoryError>
  readonly findLatest: (userId: UserId, purpose: AuthChallengePurpose, now: Date) => Effect.Effect<ChallengeLookup, AuthRepositoryError>
  readonly findActive: (userId: UserId, purpose: AuthChallengePurpose, now: Date) => Effect.Effect<Option.Option<AuthChallenge>, AuthRepositoryError>
  readonly recordFailure: (id: AuthChallenge["id"]) => Effect.Effect<AuthChallenge, AuthChallengeNotFound | AuthRepositoryError>
  readonly consume: (id: AuthChallenge["id"], consumedAt: Date) => Effect.Effect<void, AuthChallengeNotFound | InvalidRepositoryState | AuthRepositoryError>
  readonly revokePurpose: (userId: UserId, purpose: AuthChallengePurpose, revokedAt: Date) => Effect.Effect<void, AuthRepositoryError>
}>()("@proxus/backend-domain/modules/auth/repositories/AuthChallengeRepository") {}

/** Session creation is a domain port so registration does not depend on opaque-token infrastructure. */
export class SessionIssuer extends Context.Service<SessionIssuer, {
  readonly issue: (userId: UserId) => Effect.Effect<IssuedSession, AuthRepositoryError>
}>()("@proxus/backend-domain/modules/auth/repositories/SessionIssuer") {}

/** Runs all auth repositories and session issuance against one adapter transaction context. */
export class AuthTransactions extends Context.Service<AuthTransactions, {
  readonly withTransaction: <A, E>(effect: Effect.Effect<A, E, UserRepository | AuthChallengeRepository | SessionIssuer>) => Effect.Effect<A, E | AuthRepositoryError>
}>()("@proxus/backend-domain/modules/auth/repositories/AuthTransactions") {}
