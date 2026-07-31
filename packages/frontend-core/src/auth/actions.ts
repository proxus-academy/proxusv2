import {
  CompleteGoogleRegistrationInput,
  EmailAvailabilityInput,
  GoogleCallbackInput,
  RegisterWithEmailInput,
  RequestPasswordResetInput,
  ResendVerificationInput,
  ResetPasswordInput,
  VerifyEmailInput,
  UsernameAvailabilityInput,
} from "@proxus/shared/auth"
import { Effect, Schema } from "effect"
import { PublicApiClient } from "../public-api/client.js"
import { applicationRuntime } from "../runtime.js"

/** Stable auth commands shared by public clients. Platform effects stay in adapters. */
export const registerWithEmailAction = applicationRuntime.fn(
  (input: RegisterWithEmailInput) => PublicApiClient.pipe(
    Effect.flatMap((client) => client.auth.registerWithEmail({ payload: input })),
  ),
)

export const emailAvailabilityAction = applicationRuntime.fn((email: string) =>
  Schema.decodeUnknownEffect(EmailAvailabilityInput)({ email }).pipe(
    Effect.flatMap((query) => PublicApiClient.pipe(
      Effect.flatMap((client) => client.auth.emailAvailability({ query })),
    )),
  ))

export const usernameAvailabilityAction = applicationRuntime.fn((username: string) =>
  Schema.decodeUnknownEffect(UsernameAvailabilityInput)({ username }).pipe(
    Effect.flatMap((query) => PublicApiClient.pipe(
      Effect.flatMap((client) => client.auth.usernameAvailability({ query })),
    )),
  ))

export const verifyEmailAction = applicationRuntime.fn(
  (input: VerifyEmailInput) => PublicApiClient.pipe(
    Effect.flatMap((client) => client.auth.verifyEmail({ payload: input })),
  ),
  { reactivityKeys: ["auth"] },
)

export const resendVerificationAction = applicationRuntime.fn(
  (input: ResendVerificationInput) => PublicApiClient.pipe(
    Effect.flatMap((client) => client.auth.resendVerification({ payload: input })),
  ),
)

export const startGoogleAuthorizationAction = applicationRuntime.fn(
  (_request: { readonly requestId: string }) => PublicApiClient.pipe(
    Effect.flatMap((client) => client.auth.startGoogle({})),
  ),
)

export const completeGoogleCallbackAction = applicationRuntime.fn(
  (input: GoogleCallbackInput) => PublicApiClient.pipe(
    Effect.flatMap((client) => client.auth.completeGoogleCallback({ query: input })),
  ),
  { reactivityKeys: ["auth"] },
)

export const completeGoogleRegistrationAction = applicationRuntime.fn(
  (input: CompleteGoogleRegistrationInput) => PublicApiClient.pipe(
    Effect.flatMap((client) => client.auth.completeGoogleRegistration({ payload: input })),
  ),
  { reactivityKeys: ["auth"] },
)

export const requestPasswordResetAction = applicationRuntime.fn(
  (input: RequestPasswordResetInput) => PublicApiClient.pipe(
    Effect.flatMap((client) => client.auth.requestPasswordReset({ payload: input })),
  ),
)

export const resetPasswordAction = applicationRuntime.fn(
  (input: ResetPasswordInput) => PublicApiClient.pipe(
    Effect.flatMap((client) => client.auth.resetPassword({ payload: input })),
  ),
)

export const logoutAction = applicationRuntime.fn(
  () => PublicApiClient.pipe(
    Effect.flatMap((client) => client.authSession.logout({})),
  ),
  { reactivityKeys: ["auth"] },
)
