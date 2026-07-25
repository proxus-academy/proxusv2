import { AuthClient, AuthClientError, AuthUnauthorized } from "@proxus/frontend-core/auth"
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
import { PublicApi } from "@proxus/shared/public-api"
import { Data, Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"

export class AuthWebTransportError extends Data.TaggedError("AuthWebTransportError")<{
  readonly status?: number
  readonly cause: unknown
}> {}

/** Narrow transport seam: tests exercise contract-shaped values without handlers or fetch mocks. */
export interface AuthWebTransport {
  readonly currentSession: () => Effect.Effect<CurrentSession, AuthWebTransportError>
  readonly login: (input: LoginWithPasswordInput) => Effect.Effect<CurrentSession, AuthWebTransportError>
  readonly registerWithEmail: (input: RegisterWithEmailInput) => Effect.Effect<AuthRequestAccepted, AuthWebTransportError>
  readonly verifyEmail: (input: VerifyEmailInput) => Effect.Effect<CurrentSession, AuthWebTransportError>
  readonly resendVerification: (input: ResendVerificationInput) => Effect.Effect<AuthRequestAccepted, AuthWebTransportError>
  readonly startGoogle: () => Effect.Effect<GoogleAuthorization, AuthWebTransportError>
  readonly completeGoogleCallback: (input: GoogleCallbackInput) => Effect.Effect<GoogleCallbackResult, AuthWebTransportError>
  readonly completeGoogleRegistration: (input: CompleteGoogleRegistrationInput) => Effect.Effect<CurrentSession, AuthWebTransportError>
  readonly logout: () => Effect.Effect<void, AuthWebTransportError>
  readonly requestPasswordReset: (input: RequestPasswordResetInput) => Effect.Effect<AuthRequestAccepted, AuthWebTransportError>
  readonly resetPassword: (input: ResetPasswordInput) => Effect.Effect<AuthRequestAccepted, AuthWebTransportError>
}

const statusOf = (cause: unknown): number | undefined => {
  if (typeof cause !== "object" || cause === null) return undefined
  if ("status" in cause && typeof cause.status === "number") return cause.status
  if ("response" in cause) return statusOf(cause.response)
  if ("cause" in cause) return statusOf(cause.cause)
  return undefined
}

export const authWebClientLayer = (transport: AuthWebTransport) => Layer.succeed(AuthClient, AuthClient.of({
  currentSession: () => transport.currentSession().pipe(
    Effect.mapError((cause) => statusOf(cause) === 401 ? new AuthUnauthorized() : new AuthClientError({ cause })),
  ),
  login: (input) => transport.login(input).pipe(
    Effect.mapError((cause) => statusOf(cause) === 401 ? new AuthUnauthorized() : new AuthClientError({ cause })),
  ),
  registerWithEmail: (input) => transport.registerWithEmail(input).pipe(Effect.mapError((cause) => new AuthClientError({ cause }))),
  verifyEmail: (input) => transport.verifyEmail(input).pipe(Effect.mapError((cause) => statusOf(cause) === 401 ? new AuthUnauthorized() : new AuthClientError({ cause }))),
  resendVerification: (input) => transport.resendVerification(input).pipe(Effect.mapError((cause) => new AuthClientError({ cause }))),
  startGoogle: () => transport.startGoogle().pipe(Effect.mapError((cause) => new AuthClientError({ cause }))),
  completeGoogleCallback: (input) => transport.completeGoogleCallback(input).pipe(Effect.mapError((cause) => new AuthClientError({ cause }))),
  completeGoogleRegistration: (input) => transport.completeGoogleRegistration(input).pipe(Effect.mapError((cause) => statusOf(cause) === 401 ? new AuthUnauthorized() : new AuthClientError({ cause }))),
  logout: () => transport.logout().pipe(Effect.mapError((cause) => new AuthClientError({ cause }))),
  requestPasswordReset: (input) => transport.requestPasswordReset(input).pipe(
    Effect.mapError((cause) => new AuthClientError({ cause })),
  ),
  resetPassword: (input) => transport.resetPassword(input).pipe(
    Effect.mapError((cause) => new AuthClientError({ cause })),
  ),
}))

/** Typed PublicApi transport. Fetch receives `credentials: include`, so cookie rotation stays browser-owned. */
export const makeAuthWebLive = (baseUrl = "/api") => Layer.unwrap(
  HttpApiClient.make(PublicApi, { baseUrl }).pipe(
    Effect.map((client) => {
      const adapt = <A, E>(effect: Effect.Effect<A, E>) => effect.pipe(
        Effect.mapError((cause) => {
          const status = statusOf(cause)
          return new AuthWebTransportError(status === undefined ? { cause } : { status, cause })
        }),
      )
      return authWebClientLayer({
        currentSession: () => adapt(client.authSession.currentSession({})),
        login: (input) => adapt(client.auth.loginWithPassword({ payload: input })),
        registerWithEmail: (input) => adapt(client.auth.registerWithEmail({ payload: input })),
        verifyEmail: (input) => adapt(client.auth.verifyEmail({ payload: input })),
        resendVerification: (input) => adapt(client.auth.resendVerification({ payload: input })),
        startGoogle: () => adapt(client.auth.startGoogle({})),
        completeGoogleCallback: (input) => adapt(client.auth.completeGoogleCallback({ query: input })),
        completeGoogleRegistration: (input) => adapt(client.auth.completeGoogleRegistration({ payload: input })),
        logout: () => adapt(client.authSession.logout({})),
        requestPasswordReset: (input) => adapt(client.auth.requestPasswordReset({ payload: input })),
        resetPassword: (input) => adapt(client.auth.resetPassword({ payload: input })),
      })
    }),
  ),
).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(Layer.succeed(FetchHttpClient.RequestInit, { credentials: "include" })),
)
