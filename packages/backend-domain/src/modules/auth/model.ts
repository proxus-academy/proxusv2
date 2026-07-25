import { Data } from "effect"

export type UserId = string
export type SessionId = string
export type AuthChallengeId = string

export const makeSessionId = (value: string): SessionId => value
export const makeUserId = (value: string): UserId => value
export const makeAuthChallengeId = (value: string): AuthChallengeId => value

export const normalizeEmail = (email: string): string =>
  email.trim().normalize("NFKC").toLocaleLowerCase("en-US")

export type UserStatus = "pending" | "active" | "disabled"
export type AuthProvider = "email" | "google" | "both"

export interface User {
  readonly id: UserId
  readonly email: string
  readonly status: UserStatus
  readonly emailVerifiedAt: Date | null
  readonly passwordHash: string | null
  readonly googleSubject: string | null
  readonly usernameNormalized: string
  readonly birthYear: number
  readonly problemKind: "understand-content" | "prepare-exams" | "organize-study" | "choose-studies" | "other"
  readonly problemOther: string | null
  readonly subjectId: string
  readonly validatedNodeIds: readonly [string, string, string, string, string]
  readonly createdAt: Date
  readonly updatedAt: Date
}

export const makeUser = (input: Omit<User, "email"> & { readonly email: string }): User => ({
  ...input,
  email: normalizeEmail(input.email),
})

export const authProviderOf = (user: User): AuthProvider | null =>
  user.passwordHash !== null
    ? user.googleSubject !== null ? "both" : "email"
    : user.googleSubject !== null ? "google" : null

export const isUserActive = (user: User): boolean => user.status === "active"
export const isEmailVerified = (user: User): boolean => user.emailVerifiedAt !== null

export type AuthChallengePurpose = "verify-email" | "reset-password"

export interface AuthChallenge {
  readonly id: AuthChallengeId
  readonly userId: UserId
  readonly purpose: AuthChallengePurpose
  readonly codeHash: string
  readonly expiresAt: Date
  readonly failedAttempts: number
  readonly maximumAttempts: number
  readonly consumedAt: Date | null
  readonly createdAt: Date
}

export interface AuthSession {
  readonly id: SessionId
  readonly userId: UserId
  readonly tokenHash: string
  /** Hash accepted briefly after rotation so concurrent requests can finish. */
  readonly previousTokenHash: string | null
  readonly previousTokenValidUntil: Date | null
  readonly expiresAt: Date
  readonly revokedAt: Date | null
  readonly createdAt: Date
}

export type SessionRotation =
  | { readonly _tag: "Rotated"; readonly session: AuthSession }
  | { readonly _tag: "AlreadyRotated"; readonly session: AuthSession }
  | { readonly _tag: "NotActive" }

export interface IssuedSession {
  readonly session: AuthSession
  /** Opaque secret returned only when a session is issued or rotated. */
  readonly token: string
}

export type GoogleIntent = "login" | "register"

export interface GoogleAuthorizationRequest {
  readonly intent: GoogleIntent
  readonly state: string
  readonly nonce: string
}

export interface GoogleCallback {
  readonly code: string
  readonly state: string
}

export interface VerifiedGoogleIdentity {
  readonly subject: string
  readonly email: string
  readonly emailVerified: true
  readonly displayName: string | null
  /** OIDC nonce verified by the provider adapter. */
  readonly nonce: string
}

export class InvalidUserState extends Data.TaggedError("InvalidUserState")<{
  readonly userId: UserId
  readonly actual: UserStatus
}> {}

export class AuthProviderMissing extends Data.TaggedError("AuthProviderMissing")<{
  readonly userId: UserId
}> {}

export class InvalidCredentials extends Data.TaggedError("InvalidCredentials")<{}> {}
export class InvalidVerificationCode extends Data.TaggedError("InvalidVerificationCode")<{}> {}
export class VerificationCodeExpired extends Data.TaggedError("VerificationCodeExpired")<{}> {}
export class VerificationAttemptsExceeded extends Data.TaggedError("VerificationAttemptsExceeded")<{}> {}
export class VerificationCooldown extends Data.TaggedError("VerificationCooldown")<{ readonly retryAt: Date }> {}
export class UnauthorizedSession extends Data.TaggedError("UnauthorizedSession")<{}> {}
export class GoogleIdentityRejected extends Data.TaggedError("GoogleIdentityRejected")<{
  readonly reason: "invalid-callback" | "unverified-email" | "provider-failure"
}> {}
