import { Context, Effect, Layer, Option } from "effect"
import type { GoogleAuthorizationRequest, IssuedSession, User } from "./model.js"
import { normalizeEmail } from "./model.js"
import type { RegistrationDraft } from "./onboarding.js"
import { UserRepository, type AuthRepositoryError, type UserConflict, type UserNotFound } from "./repositories.js"
import type { EmailDeliveryError, PasswordError, VerificationCodeGenerationError } from "./ports.js"
import type { GoogleIdentityRejected, InvalidCredentials, InvalidUserState, InvalidVerificationCode, UnauthorizedSession, VerificationAttemptsExceeded, VerificationCodeExpired, VerificationCooldown } from "./model.js"

export interface EmailRegistrationDraft extends RegistrationDraft {
  readonly email: string
  readonly password: string
}
export interface PasswordLoginInput { readonly email: string; readonly password: string }

export type RegistrationError = UserConflict | UserNotFound | InvalidUserState | InvalidVerificationCode | VerificationCodeExpired | VerificationAttemptsExceeded | VerificationCooldown | PasswordError | VerificationCodeGenerationError | EmailDeliveryError | GoogleIdentityRejected | AuthRepositoryError
export type AuthenticationError = InvalidCredentials | InvalidUserState | InvalidVerificationCode | VerificationCodeExpired | VerificationAttemptsExceeded | UnauthorizedSession | PasswordError | VerificationCodeGenerationError | EmailDeliveryError | AuthRepositoryError

/** Registration owns account creation; onboarding details are added by the onboarding model. */
export class RegistrationService extends Context.Service<RegistrationService, {
  readonly registerWithEmail: (draft: EmailRegistrationDraft) => Effect.Effect<User, RegistrationError>
  readonly startGoogle: (request: GoogleAuthorizationRequest) => Effect.Effect<string, GoogleIdentityRejected>
  readonly completeGoogle: (registrationId: string, draft: RegistrationDraft) => Effect.Effect<IssuedSession, RegistrationError>
  readonly verifyEmail: (email: string, code: string) => Effect.Effect<IssuedSession, RegistrationError>
  readonly resendVerification: (email: string) => Effect.Effect<void, RegistrationError>
}>()("@proxus/backend-domain/modules/auth/services/RegistrationService") {}

export class RegistrationAvailability extends Context.Service<RegistrationAvailability, {
  readonly emailAvailable: (email: string) => Effect.Effect<boolean, AuthRepositoryError>
  readonly usernameAvailable: (username: string) => Effect.Effect<boolean, AuthRepositoryError>
}>()("@proxus/backend-domain/modules/auth/services/RegistrationAvailability") {
  static readonly layer = Layer.effect(RegistrationAvailability, Effect.gen(function*() {
    const users = yield* UserRepository
    return RegistrationAvailability.of({
      emailAvailable: (email) => users.findByEmail(normalizeEmail(email)).pipe(Effect.map(Option.isNone)),
      usernameAvailable: (username) => users.usernameExists(username.normalize("NFKC").toLocaleLowerCase("en-US")).pipe(Effect.map((exists) => !exists)),
    })
  }))
}

export class AuthenticationService extends Context.Service<AuthenticationService, {
  readonly loginWithPassword: (input: PasswordLoginInput) => Effect.Effect<IssuedSession, AuthenticationError>
  readonly requestPasswordReset: (email: string) => Effect.Effect<void, AuthenticationError>
  readonly resetPassword: (email: string, code: string, password: string) => Effect.Effect<void, AuthenticationError>
  readonly currentSession: (token: string) => Effect.Effect<IssuedSession, AuthenticationError>
  readonly logout: (token: string) => Effect.Effect<void, AuthenticationError>
  readonly logoutSession: (sessionId: import("./model.js").SessionId) => Effect.Effect<void, AuthenticationError>
}>()("@proxus/backend-domain/modules/auth/services/AuthenticationService") {}
