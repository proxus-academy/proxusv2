// @effect-diagnostics globalDate:off globalDateInEffect:off
import { Clock, Effect, Layer, Option, Random } from "effect"
import {
  AuthChallengeRepository,
  AuthRepositoryError,
  AuthenticationService,
  EmailDelivery,
  InvalidCredentials,
  InvalidUserState,
  InvalidVerificationCode,
  Passwords,
  SessionRepository,
  UnauthorizedSession,
  UserRepository,
  VerificationAttemptsExceeded,
  VerificationCodeGenerator,
  normalizeEmail,
  type AuthChallengeId,
  type User,
} from "@proxus/backend-domain/auth"
import { OpaqueSessions } from "./sessions.js"

export interface AuthenticationPolicy {
  readonly passwordResetTtlMillis: number
  readonly passwordResetMaximumAttempts: number
}

const randomId = (random: typeof Random.Random.Service): AuthChallengeId => {
  const parts = Array.from({ length: 4 }, () => Math.abs(random.nextIntUnsafe()).toString(36).padStart(7, "0"))
  // SAFETY: The surrounding typed contract establishes the asserted representation.
  return parts.join("") as AuthChallengeId
}

/** Password/session authentication application service. It deliberately has no HTTP concerns. */
export const makeAuthenticationLive = (policy: AuthenticationPolicy) => Layer.effect(
  AuthenticationService,
  Effect.gen(function*() {
    const users = yield* UserRepository
    const sessions = yield* SessionRepository
    const opaqueSessions = yield* OpaqueSessions
    const passwords = yield* Passwords
    const challenges = yield* AuthChallengeRepository
    const codes = yield* VerificationCodeGenerator
    const email = yield* EmailDelivery
    const random = yield* Random.Random
    const now = () => Clock.currentTimeMillis.pipe(Effect.map((millis) => new Date(millis)))

    const activeUser = (user: User): Effect.Effect<User, InvalidUserState> => {
      if (user.status === "active") return Effect.succeed(user)
      return Effect.fail(new InvalidUserState({ userId: user.id, actual: user.status }))
    }

    const resolveActive = (token: string) => Effect.gen(function*() {
      const resolved = yield* opaqueSessions.resolve(token)
      if (resolved._tag === "Missing") return yield* new UnauthorizedSession()
      const userOption = yield* users.getById(resolved.session.userId)
      if (Option.isNone(userOption)) return yield* new UnauthorizedSession()
      yield* activeUser(userOption.value).pipe(Effect.mapError(() => new UnauthorizedSession()))
      return { resolved, user: userOption.value }
    })

    return AuthenticationService.of({
      loginWithPassword: ({ email, password }) => Effect.gen(function*() {
        const found = yield* users.findByEmail(normalizeEmail(email))
        if (Option.isNone(found)) return yield* new InvalidCredentials()
        const user = found.value
        const passwordHash = user.passwordHash
        if (passwordHash === null) return yield* new InvalidCredentials()
        if (user.status !== "active") return yield* new InvalidCredentials()
        if (!(yield* passwords.verify(password, passwordHash))) return yield* new InvalidCredentials()
        return yield* opaqueSessions.create(user.id)
      }),

      currentSession: (token) => Effect.gen(function*() {
        const { resolved } = yield* resolveActive(token)
        return {
          session: resolved.session,
          token: resolved._tag === "Rotated" ? resolved.token : token,
        }
      }),

      logout: (token) => Effect.gen(function*() {
        const { resolved } = yield* resolveActive(token)
        yield* sessions.revoke(resolved.session.id, yield* now()).pipe(
          Effect.mapError((cause) => new AuthRepositoryError({ operation: "logout", cause })),
        )
      }),
      logoutSession: (sessionId) => Effect.gen(function*() {
        yield* sessions.revoke(sessionId, yield* now()).pipe(
          Effect.mapError((cause) => new AuthRepositoryError({ operation: "logoutSession", cause })),
        )
      }),

      requestPasswordReset: (address) => Effect.gen(function*() {
        const found = yield* users.findByEmail(normalizeEmail(address))
        // Anti-enumeration: unknown, pending, disabled and passwordless accounts all succeed silently.
        if (Option.isNone(found) || found.value.status !== "active" || found.value.passwordHash === null) return
        const user = found.value
        const code = yield* codes.generate()
        const createdAt = yield* now()
        const expiresAt = new Date(createdAt.getTime() + policy.passwordResetTtlMillis)
        yield* challenges.issue({
          id: randomId(random), userId: user.id, purpose: "reset-password",
          codeHash: yield* passwords.hash(code), expiresAt, failedAttempts: 0,
          maximumAttempts: policy.passwordResetMaximumAttempts, consumedAt: null, createdAt,
        })
        yield* email.sendPasswordReset({ recipient: user.email, purpose: "reset-password", code, expiresAt })
      }),

      resetPassword: (address, code, password) => Effect.gen(function*() {
        const found = yield* users.findByEmail(normalizeEmail(address))
        if (Option.isNone(found) || found.value.status !== "active" || found.value.passwordHash === null) {
          return yield* new InvalidVerificationCode()
        }
        const user = found.value
        const changedAt = yield* now()
        const challenge = yield* challenges.findActive(user.id, "reset-password", changedAt)
        if (Option.isNone(challenge)) return yield* new InvalidVerificationCode()
        if (!(yield* passwords.verify(code, challenge.value.codeHash))) {
          const failed = yield* challenges.recordFailure(challenge.value.id).pipe(
            Effect.mapError((cause) => new AuthRepositoryError({ operation: "recordPasswordResetFailure", cause })),
          )
          if (failed.failedAttempts >= failed.maximumAttempts) return yield* new VerificationAttemptsExceeded()
          return yield* new InvalidVerificationCode()
        }
        const passwordHash = yield* passwords.hash(password)
        yield* users.updatePasswordHash(user.id, passwordHash, changedAt).pipe(
          Effect.mapError((cause) => new AuthRepositoryError({ operation: "updatePasswordHash", cause })),
        )
        yield* challenges.consume(challenge.value.id, changedAt).pipe(
          Effect.mapError((cause) => new AuthRepositoryError({ operation: "consumePasswordReset", cause })),
        )
        yield* sessions.revokeAllForAccount(user.id, changedAt)
      }),
    })
  }),
)
