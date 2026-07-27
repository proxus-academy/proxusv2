import type {
  CompleteGoogleRegistrationInput,
  GoogleCallbackInput,
  RegisterWithEmailInput,
  RequestPasswordResetInput,
  ResendVerificationInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from "@proxus/shared/auth"
import { Effect } from "effect"
import { publicApiClient } from "../public-api/client.js"
import { applicationRuntime } from "../runtime.js"

/** Stable auth commands shared by public clients. Platform effects stay in adapters. */
export const registerWithEmailAction = applicationRuntime.fn(
  (input: RegisterWithEmailInput) => publicApiClient.pipe(
    Effect.flatMap((client) => client.auth.registerWithEmail({ payload: input })),
  ),
)

export const verifyEmailAction = applicationRuntime.fn(
  (input: VerifyEmailInput) => publicApiClient.pipe(
    Effect.flatMap((client) => client.auth.verifyEmail({ payload: input })),
  ),
  { reactivityKeys: ["auth"] },
)

export const resendVerificationAction = applicationRuntime.fn(
  (input: ResendVerificationInput) => publicApiClient.pipe(
    Effect.flatMap((client) => client.auth.resendVerification({ payload: input })),
  ),
)

export const startGoogleAuthorizationAction = applicationRuntime.fn(
  () => publicApiClient.pipe(
    Effect.flatMap((client) => client.auth.startGoogle({})),
  ),
)

export const completeGoogleCallbackAction = applicationRuntime.fn(
  (input: GoogleCallbackInput) => publicApiClient.pipe(
    Effect.flatMap((client) => client.auth.completeGoogleCallback({ query: input })),
  ),
  { reactivityKeys: ["auth"] },
)

export const completeGoogleRegistrationAction = applicationRuntime.fn(
  (input: CompleteGoogleRegistrationInput) => publicApiClient.pipe(
    Effect.flatMap((client) => client.auth.completeGoogleRegistration({ payload: input })),
  ),
  { reactivityKeys: ["auth"] },
)

export const requestPasswordResetAction = applicationRuntime.fn(
  (input: RequestPasswordResetInput) => publicApiClient.pipe(
    Effect.flatMap((client) => client.auth.requestPasswordReset({ payload: input })),
  ),
)

export const resetPasswordAction = applicationRuntime.fn(
  (input: ResetPasswordInput) => publicApiClient.pipe(
    Effect.flatMap((client) => client.auth.resetPassword({ payload: input })),
  ),
)

export const logoutAction = applicationRuntime.fn(
  () => publicApiClient.pipe(
    Effect.flatMap((client) => client.authSession.logout({})),
  ),
  { reactivityKeys: ["auth"] },
)
