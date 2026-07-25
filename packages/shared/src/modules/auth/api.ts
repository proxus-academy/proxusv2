import { HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import {
  AuthRequestAccepted,
  CompleteGoogleRegistrationInput,
  GoogleAuthorization,
  GoogleCallbackInput,
  GoogleCallbackResult,
  LoginWithPasswordInput,
  RegisterWithEmailInput,
  RequestPasswordResetInput,
  ResendVerificationInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from "./contract.js"
import {
  AuthCodeInvalid,
  AuthenticationFailed,
  AuthRegistrationConflict,
  GoogleAuthenticationFailed,
} from "./errors.js"
import { SessionAuthorization } from "./middleware.js"
import { CurrentSession } from "./model.js"

const internalError = HttpApiError.InternalServerErrorNoContent

export class AuthApi extends HttpApiGroup.make("auth")
  .add(
    HttpApiEndpoint.post("registerWithEmail", "/register/email", {
      payload: RegisterWithEmailInput,
      success: AuthRequestAccepted.pipe(HttpApiSchema.status("Accepted")),
      error: [AuthRegistrationConflict, internalError],
    }),
    HttpApiEndpoint.post("verifyEmail", "/verify-email", {
      payload: VerifyEmailInput,
      success: CurrentSession,
      error: [AuthCodeInvalid, internalError],
    }),
    HttpApiEndpoint.post("resendVerification", "/verify-email/resend", {
      payload: ResendVerificationInput,
      success: AuthRequestAccepted.pipe(HttpApiSchema.status("Accepted")),
      error: internalError,
    }),
    HttpApiEndpoint.post("loginWithPassword", "/login", {
      payload: LoginWithPasswordInput,
      success: CurrentSession,
      error: [AuthenticationFailed, internalError],
    }),
    HttpApiEndpoint.post("requestPasswordReset", "/password-reset/request", {
      payload: RequestPasswordResetInput,
      success: AuthRequestAccepted.pipe(HttpApiSchema.status("Accepted")),
      error: internalError,
    }),
    HttpApiEndpoint.post("resetPassword", "/password-reset/confirm", {
      payload: ResetPasswordInput,
      success: AuthRequestAccepted,
      error: [AuthCodeInvalid, internalError],
    }),
    HttpApiEndpoint.get("startGoogle", "/google/start", {
      success: GoogleAuthorization,
      error: internalError,
    }),
    HttpApiEndpoint.get("completeGoogleCallback", "/google/callback", {
      query: GoogleCallbackInput.fields,
      success: GoogleCallbackResult,
      error: [GoogleAuthenticationFailed, internalError],
    }),
    HttpApiEndpoint.post("completeGoogleRegistration", "/google/register", {
      payload: CompleteGoogleRegistrationInput,
      success: CurrentSession,
      error: [AuthRegistrationConflict, GoogleAuthenticationFailed, internalError],
    }),
  )
  .prefix("/auth")
  .annotateMerge(OpenApi.annotations({ title: "Authentication" })) {}

export class SessionApi extends HttpApiGroup.make("authSession")
  .add(
    HttpApiEndpoint.get("currentSession", "/auth/session", { success: CurrentSession }),
    HttpApiEndpoint.post("logout", "/auth/logout", {
      success: HttpApiSchema.NoContent,
      error: internalError,
    }),
  )
  .middleware(SessionAuthorization) {}
