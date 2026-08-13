import { createHash, randomUUID } from "node:crypto"
import {
  AuthChallengeRepository,
  AuthRepositoryError,
  AuthTransactions,
  EmailDelivery,
  GoogleIdentityRejected,
  GoogleSecurity,
  InvalidUserState,
  InvalidVerificationCode,
  Passwords,
  RegistrationService,
  SessionIssuer,
  UserConflict,
  UserRepository,
  VerificationAttemptsExceeded,
  VerificationCodeExpired,
  VerificationCodeGenerator,
  VerificationCooldown,
  makeUser,
  makeUserId,
  normalizeEmail,
  type AuthChallenge,
  type EmailRegistrationDraft,
  type User,
} from "@proxus/backend-domain/auth"
import { Clock, DateTime, Effect, Layer, Option } from "effect"

export interface EmailRegistrationPolicy {
  readonly challengeTtlMillis: number
  readonly resendCooldownMillis: number
  readonly maximumAttempts: number
}

const hashCode = (code: string) => createHash("sha256").update(code, "utf8").digest("base64url")
const uuid = () => randomUUID()

export const makeEmailRegistrationServiceLive = (policy: EmailRegistrationPolicy) => Layer.effect(
  RegistrationService,
  Effect.gen(function*() {
    const passwords = yield* Passwords
    const codes = yield* VerificationCodeGenerator
    const email = yield* EmailDelivery
    const transactions = yield* AuthTransactions
    const googleSecurity = yield* GoogleSecurity

    const date = (millis: number) => DateTime.toDateUtc(DateTime.makeUnsafe(millis))
    const now = () => Clock.currentTimeMillis.pipe(Effect.map(date))
    const issue = (user: User, checkedAt: Date) => Effect.gen(function*() {
      const challenges = yield* AuthChallengeRepository
      const latest = yield* challenges.findLatest(user.id, "verify-email", checkedAt)
      if (latest._tag === "Active") {
        const retryAt = date(latest.challenge.createdAt.getTime() + policy.resendCooldownMillis)
        if (retryAt > checkedAt) return yield* new VerificationCooldown({ retryAt })
      }
      const code = yield* codes.generate()
      const challenge: AuthChallenge = {
        // SAFETY: The surrounding typed contract establishes the asserted representation.
        id: uuid() as AuthChallenge["id"], userId: user.id, purpose: "verify-email", codeHash: hashCode(code),
        expiresAt: date(checkedAt.getTime() + policy.challengeTtlMillis), failedAttempts: 0,
        maximumAttempts: policy.maximumAttempts, consumedAt: null, createdAt: checkedAt,
      }
      yield* challenges.issue(challenge)
      yield* email.sendVerification({ recipient: user.email, purpose: "verify-email", code, expiresAt: challenge.expiresAt })
    })

    return RegistrationService.of({
      registerWithEmail: (draft: EmailRegistrationDraft) => Effect.gen(function*() {
        const checkedAt = yield* now()
        const passwordHash = yield* passwords.hash(draft.password)
        const user = makeUser({
          id: makeUserId(uuid()), email: draft.email, status: "pending", emailVerifiedAt: null, passwordHash,
          googleSubject: null, usernameNormalized: draft.normalizedUsername, birthYear: draft.birthYear,
          problemKind: draft.problem.kind, problemOther: draft.problem.kind === "other" ? draft.problem.otherText : null,
          acquisitionSource: draft.acquisition.source, acquisitionOther: draft.acquisition.otherText,
          studyId: draft.study.studyId, subjectId: draft.study.subjectId,
          createdAt: checkedAt, updatedAt: checkedAt,
        })
        return yield* transactions.withTransaction(Effect.gen(function*() {
          const created = yield* (yield* UserRepository).createPending(user)
          yield* issue(created, checkedAt)
          return created
        }))
      }),
      resendVerification: (address) => Effect.gen(function*() {
        const checkedAt = yield* now()
        const normalized = normalizeEmail(address)
        // Deliberately return success for unknown/non-pending accounts (anti-enumeration).
        const found = yield* transactions.withTransaction(Effect.gen(function*() {
          const candidate = yield* (yield* UserRepository).findByEmail(normalized)
          if (Option.isNone(candidate) || candidate.value.status !== "pending") return Option.none<User>()
          yield* issue(candidate.value, checkedAt)
          return Option.some(candidate.value)
        }))
        void found
      }),
      verifyEmail: (address, code) => Effect.gen(function*() {
        const checkedAt = yield* now()
        return yield* transactions.withTransaction(Effect.gen(function*() {
          const users = yield* UserRepository
          const challenges = yield* AuthChallengeRepository
          const found = yield* users.findByEmail(normalizeEmail(address))
          if (Option.isNone(found)) return yield* new InvalidVerificationCode()
          const user = found.value
          if (user.status !== "pending") return yield* new InvalidUserState({ userId: user.id, actual: user.status })
          const lookup = yield* challenges.findLatest(user.id, "verify-email", checkedAt)
          if (lookup._tag === "Missing") return yield* new InvalidVerificationCode()
          if (lookup._tag === "Expired") return yield* new VerificationCodeExpired()
          if (lookup._tag === "Used") return yield* new InvalidVerificationCode()
          if (lookup._tag === "AttemptsExceeded") return yield* new VerificationAttemptsExceeded()
          if (lookup.challenge.codeHash !== hashCode(code)) {
            const failed = yield* challenges.recordFailure(lookup.challenge.id).pipe(
              Effect.catchTag("AuthChallengeNotFound", () => new InvalidVerificationCode()),
            )
            return yield* failed.failedAttempts >= failed.maximumAttempts ? new VerificationAttemptsExceeded() : new InvalidVerificationCode()
          }
          yield* challenges.consume(lookup.challenge.id, checkedAt).pipe(
            Effect.catchTags({
              AuthChallengeNotFound: () => new InvalidVerificationCode(),
              InvalidRepositoryState: () => new InvalidVerificationCode(),
            }),
          )
          yield* users.activate(user.id, checkedAt).pipe(
            Effect.catchTag("InvalidRepositoryState", () => new InvalidUserState({ userId: user.id, actual: user.status })),
          )
          return yield* (yield* SessionIssuer).issue(user.id)
        }))
      }),
      startGoogle: () => Effect.fail(new GoogleIdentityRejected({ reason: "provider-failure" })),
      completeGoogle: (registrationId, draft) => Effect.gen(function*() {
        const pending = yield* googleSecurity.verifyPending(registrationId)
        const checkedAt = yield* Clock.currentTimeMillis
        if (pending.expiresAt <= checkedAt) return yield* new GoogleIdentityRejected({ reason: "invalid-callback" })
        return yield* transactions.withTransaction(Effect.gen(function*() {
          const user = makeUser({
            id: makeUserId(uuid()), email: pending.email, status: "active", emailVerifiedAt: date(checkedAt), passwordHash: null,
            googleSubject: pending.subject, usernameNormalized: draft.normalizedUsername, birthYear: draft.birthYear,
            problemKind: draft.problem.kind, problemOther: draft.problem.kind === "other" ? draft.problem.otherText : null,
            acquisitionSource: draft.acquisition.source, acquisitionOther: draft.acquisition.otherText,
            studyId: draft.study.studyId, subjectId: draft.study.subjectId,
            createdAt: date(checkedAt), updatedAt: date(checkedAt),
          })
          const created = yield* (yield* UserRepository).createGoogleActive(user)
          return yield* (yield* SessionIssuer).issue(created.id)
        }))
      }),
    })
  }),
)
