import {
  AuthenticationService,
  GoogleFlow,
  RegistrationService,
  RegistrationAvailability,
  validateRegistrationDraft,
  makeSessionId as makeDomainSessionId,
  type IssuedSession,
  type User,
} from "@proxus/backend-domain/auth"
import {
  AccountSummary,
  AuthAvailability,
  AuthCodeInvalid,
  AuthRegistrationConflict,
  AuthenticationFailed,
  AuthRequestAccepted,
  CurrentSession,
  CurrentUser,
  EmailAddress,
  ExistingGoogleSession,
  GoogleAuthenticationFailed,
  GoogleAuthorization,
  NewGoogleRegistration,
  SessionAuthorization,
  Unauthorized,
  authSessionCookieName,
  makeGoogleRegistrationId,
} from "@proxus/shared/auth"
import { Clock, Context, DateTime, Effect, Layer, Redacted, Schema } from "effect"
import { PublicApi } from "@proxus/shared/public-api"
import * as HttpEffect from "effect/unstable/http/HttpEffect"
import type { HttpServerRequest } from "effect/unstable/http/HttpServerRequest"
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"

export interface AuthCookieOptions {
  readonly secure: boolean
  readonly sameSite: "lax" | "strict" | "none"
}

const cookieOptions = (options: AuthCookieOptions) => ({
  httpOnly: true as const,
  secure: options.secure,
  sameSite: options.sameSite,
  path: "/" as const,
})

/** Transport-only response mutation. Token values remain opaque and are never logged or serialized.
 * @effect-expect-leaking HttpServerRequest
 */
export class AuthSessionCookies extends Context.Service<AuthSessionCookies, {
  readonly set: (token: string, expiresAt: Date) => Effect.Effect<void, never, HttpServerRequest>
  readonly expire: Effect.Effect<void, never, HttpServerRequest>
}>()("@proxus/backend-transport/modules/auth/http/AuthSessionCookies") {}

export const makeAuthSessionCookies = (options: AuthCookieOptions): Layer.Layer<AuthSessionCookies> =>
  Layer.succeed(AuthSessionCookies, AuthSessionCookies.of({
    set: (token, expiresAt) => HttpEffect.appendPreResponseHandler((_request, response) =>
      HttpServerResponse.setCookie(response, authSessionCookieName, token, {
        ...cookieOptions(options),
        expires: expiresAt,
      }).pipe(Effect.orDie),
    ),
    expire: HttpEffect.appendPreResponseHandler((_request, response) =>
      HttpServerResponse.expireCookie(response, authSessionCookieName, cookieOptions(options)).pipe(Effect.orDie),
    ),
  }))

/** Maps an internal session/user to the deliberately secret-free wire projection. */
export class AuthSessionView extends Context.Service<AuthSessionView, {
  readonly fromIssued: (issued: IssuedSession) => Effect.Effect<CurrentSession, HttpApiError.InternalServerError>
  readonly account: (user: User) => Effect.Effect<AccountSummary, HttpApiError.InternalServerError>
}>()("@proxus/backend-transport/modules/auth/http/AuthSessionView") {}

const internal = () => new HttpApiError.InternalServerError({})
const accepted = () => new AuthRequestAccepted({ accepted: true })
const authFailed = () => new AuthenticationFailed({})
const codeInvalid = () => new AuthCodeInvalid({})
const registrationConflict = () => new AuthRegistrationConflict({})
const googleFailed = () => new GoogleAuthenticationFailed({})

const registrationError = (error: { readonly _tag: string }) =>
  error._tag === "UserConflict" || error._tag === "InvalidUserState" ? registrationConflict() : internal()
const verificationError = (error: { readonly _tag: string }) =>
  error._tag === "InvalidVerificationCode" || error._tag === "VerificationCodeExpired" || error._tag === "VerificationAttemptsExceeded" ? codeInvalid() : internal()
const authenticationError = (error: { readonly _tag: string }) =>
  error._tag === "InvalidCredentials" || error._tag === "InvalidUserState" || error._tag === "UnauthorizedSession" ? authFailed() : internal()
const resetError = (error: { readonly _tag: string }) =>
  error._tag === "InvalidVerificationCode" || error._tag === "VerificationCodeExpired" || error._tag === "VerificationAttemptsExceeded" ? codeInvalid() : internal()

const attachSession = (issued: IssuedSession) => Effect.gen(function*() {
  const cookies = yield* AuthSessionCookies
  const view = yield* AuthSessionView
  yield* cookies.set(issued.token, issued.session.expiresAt)
  return yield* view.fromIssued(issued)
})
const preventCaching = HttpEffect.appendPreResponseHandler((_request, response) =>
  Effect.succeed(HttpServerResponse.setHeader(response, "cache-control", "no-store")))

export const PublicAuthHandlers = HttpApiBuilder.group(PublicApi, "auth", Effect.fn(function* (handlers) {
  const registration = yield* RegistrationService
  const availability = yield* RegistrationAvailability
  const authentication = yield* AuthenticationService
  const google = yield* GoogleFlow

  return handlers
    .handle("emailAvailability", ({ query }) => availability.emailAvailable(query.email).pipe(
      Effect.map((available) => new AuthAvailability({ available })),
      Effect.mapError(() => internal()),
    ))
    .handle("usernameAvailability", ({ query }) => availability.usernameAvailable(query.username).pipe(
      Effect.map((available) => new AuthAvailability({ available })),
      Effect.mapError(() => internal()),
    ))
    .handle("registerWithEmail", ({ payload }) => Clock.currentTimeMillis.pipe(
      Effect.map((now) => DateTime.toDateUtc(DateTime.makeUnsafe(now)).getUTCFullYear()),
      Effect.flatMap((year) => validateRegistrationDraft(payload.onboarding, year).pipe(Effect.mapError(() => registrationConflict()))),
      Effect.flatMap((draft) => registration.registerWithEmail({ ...draft, email: payload.email, password: payload.password }).pipe(Effect.mapError(registrationError))),
      Effect.as(accepted()),
    ))
    .handle("verifyEmail", ({ payload }) => registration.verifyEmail(payload.email, payload.code).pipe(Effect.mapError(verificationError), Effect.flatMap(attachSession)))
    .handle("resendVerification", ({ payload }) => registration.resendVerification(payload.email).pipe(Effect.mapError(() => internal()), Effect.as(accepted())))
    .handle("loginWithPassword", ({ payload }) => authentication.loginWithPassword(payload).pipe(Effect.mapError(authenticationError), Effect.flatMap(attachSession)))
    .handle("requestPasswordReset", ({ payload }) => authentication.requestPasswordReset(payload.email).pipe(
      // Account existence and account state are intentionally indistinguishable.
      Effect.catch(() => Effect.void),
      Effect.as(accepted()),
    ))
    .handle("resetPassword", ({ payload }) => authentication.resetPassword(payload.email, payload.code, payload.password).pipe(Effect.mapError(resetError), Effect.as(accepted())))
    .handle("startGoogle", () => Effect.gen(function*() {
      yield* preventCaching
      return yield* google.start("login").pipe(
        Effect.map(({ url }) => new GoogleAuthorization({ authorizationUrl: url })),
        Effect.mapError(() => internal()),
      )
    }))
    .handle("completeGoogleCallback", ({ query }) => Effect.gen(function*() {
      const resolution = yield* google.complete(query).pipe(Effect.mapError(() => googleFailed()))
      if (resolution._tag === "Authenticated") return yield* attachSession(resolution.session).pipe(Effect.map((session) => new ExistingGoogleSession({ session })))
      if (resolution._tag === "NewIdentity") {
        // The signed pending value is server-authoritative. UUID-shaped handles are required by the step-1 wire contract.
        return yield* Effect.try({
          try: () => new NewGoogleRegistration({ registrationId: makeGoogleRegistrationId(resolution.pending), email: Schema.decodeUnknownSync(EmailAddress)(resolution.email) }),
          catch: () => googleFailed(),
        })
      }
      return yield* googleFailed()
    }))
    .handle("completeGoogleRegistration", ({ payload }) => Clock.currentTimeMillis.pipe(
      Effect.map((now) => DateTime.toDateUtc(DateTime.makeUnsafe(now)).getUTCFullYear()),
      Effect.flatMap((year) => validateRegistrationDraft(payload.onboarding, year).pipe(Effect.mapError(() => registrationConflict()))),
      Effect.flatMap((draft) => registration.completeGoogle(payload.registrationId, draft).pipe(
        Effect.mapError((error) => error._tag === "GoogleIdentityRejected" ? googleFailed() : registrationError(error)),
      )),
      Effect.flatMap(attachSession),
    ))
}))

export const SessionAuthorizationLive = Layer.effect(SessionAuthorization, Effect.gen(function*() {
  const authentication = yield* AuthenticationService
  const view = yield* AuthSessionView
  const cookies = yield* AuthSessionCookies
  return SessionAuthorization.of({
    session: Effect.fn(function*(httpEffect, { credential }) {
      const token = Redacted.value(credential)
      const issued = yield* authentication.currentSession(token).pipe(
        Effect.catch(() => Effect.andThen(cookies.expire, Effect.fail(new Unauthorized({})))),
      )
      const current = yield* view.fromIssued(issued).pipe(Effect.orDie)
      // Sliding renewal is transparent: the service only returns a new token when it rotated.
      if (issued.token !== token) yield* cookies.set(issued.token, issued.session.expiresAt)
      return yield* Effect.provideService(httpEffect, CurrentUser, current)
    }),
  })
}))

export const PublicSessionHandlers = HttpApiBuilder.group(PublicApi, "authSession", Effect.fn(function* (handlers) {
  const authentication = yield* AuthenticationService
  const cookies = yield* AuthSessionCookies
  return handlers
    .handle("currentSession", () => CurrentUser)
    .handle("logout", () => Effect.gen(function*() {
      const current = yield* CurrentUser
      // Logout by session identity is intentionally delegated to the service; the middleware has
      // already rotated the active credential when required.
      yield* authentication.logoutSession(makeDomainSessionId(current.sessionId)).pipe(Effect.mapError(internal))
      yield* cookies.expire
    }))
}))
