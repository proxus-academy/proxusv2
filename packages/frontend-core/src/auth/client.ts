import type {
  AuthRequestAccepted,
  CompleteGoogleRegistrationInput,
  CurrentSession,
  GoogleAuthorization,
  GoogleCallbackInput,
  GoogleCallbackResult,
  LoginWithPasswordInput,
  RegisterWithEmailInput,
  RequestPasswordResetInput,
  ResendVerificationInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from "@proxus/shared/auth"
import { Context, Data, Effect } from "effect"

export class AuthClientError extends Data.TaggedError("AuthClientError")<{
  readonly cause: unknown
}> {}

/** A missing or expired cookie is an expected anonymous state, not a transport failure. */
export class AuthUnauthorized extends Data.TaggedError("AuthUnauthorized")<{}> {}

export type AuthError = AuthClientError | AuthUnauthorized

/** Platform-neutral asynchronous seam used by the auth atoms. */
export class AuthClient extends Context.Service<AuthClient, {
  readonly currentSession: () => Effect.Effect<CurrentSession, AuthError>
  readonly login: (input: LoginWithPasswordInput) => Effect.Effect<CurrentSession, AuthError>
  readonly registerWithEmail: (input: RegisterWithEmailInput) => Effect.Effect<AuthRequestAccepted, AuthClientError>
  readonly verifyEmail: (input: VerifyEmailInput) => Effect.Effect<CurrentSession, AuthError>
  readonly resendVerification: (input: ResendVerificationInput) => Effect.Effect<AuthRequestAccepted, AuthClientError>
  readonly startGoogle: () => Effect.Effect<GoogleAuthorization, AuthClientError>
  readonly completeGoogleCallback: (input: GoogleCallbackInput) => Effect.Effect<GoogleCallbackResult, AuthClientError>
  readonly completeGoogleRegistration: (input: CompleteGoogleRegistrationInput) => Effect.Effect<CurrentSession, AuthError>
  readonly logout: () => Effect.Effect<void, AuthClientError>
  readonly requestPasswordReset: (
    input: RequestPasswordResetInput,
  ) => Effect.Effect<AuthRequestAccepted, AuthClientError>
  readonly resetPassword: (
    input: ResetPasswordInput,
  ) => Effect.Effect<AuthRequestAccepted, AuthClientError>
}>()("@proxus/frontend-core/auth/client/AuthClient") {}
