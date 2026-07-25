import { Access } from "@proxus/backend-domain/access-control"
import { AuthenticationService, UserRepository, authProviderOf, makeUserId } from "@proxus/backend-domain/auth"
import { AccountSummary, CurrentSession, CurrentUser, EmailAddress, SessionAuthorization, Unauthorized, Username, authSessionCookieName, makeAccountId, makeSessionId } from "@proxus/shared/auth"
import { DateTime, Effect, Layer, Option, Redacted, Schema } from "effect"
import * as HttpEffect from "effect/unstable/http/HttpEffect"
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse"

const expireCookie = HttpEffect.appendPreResponseHandler((_request, response) =>
  HttpServerResponse.expireCookie(response, authSessionCookieName, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/",
  }).pipe(Effect.orDie),
)
const setCookie = (token: string, expiresAt: Date) => HttpEffect.appendPreResponseHandler((_request, response) =>
  HttpServerResponse.setCookie(response, authSessionCookieName, token, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: expiresAt,
  }).pipe(Effect.orDie),
)

/** Admin-owned session middleware. It intentionally does not import backend-transport. */
export const AdminSessionAuthorizationLive = Layer.effect(SessionAuthorization, Effect.gen(function* () {
  const authentication = yield* AuthenticationService
  const users = yield* UserRepository
  return SessionAuthorization.of({
    session: Effect.fn(function* (httpEffect, { credential }) {
      const token = Redacted.value(credential)
      const issued = yield* authentication.currentSession(token).pipe(
        Effect.catch(() => Effect.andThen(expireCookie, Effect.fail(new Unauthorized({})))),
      )
      const user = yield* users.getById(makeUserId(issued.session.userId)).pipe(
        Effect.flatMap(Option.match({ onNone: () => Effect.fail(new Unauthorized({})), onSome: Effect.succeed })),
        Effect.catch(() => Effect.andThen(expireCookie, Effect.fail(new Unauthorized({})))),
      )
      const provider = authProviderOf(user)
      if (provider === null || user.status !== "active") return yield* Effect.andThen(expireCookie, Effect.fail(new Unauthorized({})))
      const current = new CurrentSession({
        sessionId: makeSessionId(issued.session.id),
        account: new AccountSummary({
          id: makeAccountId(user.id), email: Schema.decodeUnknownSync(EmailAddress)(user.email), username: Schema.decodeUnknownSync(Username)(user.usernameNormalized),
          status: user.status, provider,
        }),
        expiresAt: DateTime.makeUnsafe(issued.session.expiresAt.getTime()),
      })
      if (issued.token !== token) yield* setCookie(issued.token, issued.session.expiresAt)
      return yield* Effect.provideService(
        Effect.provideService(httpEffect, CurrentUser, current),
        // Transport translates the authenticated wire identity into the canonical domain subject.
        Access.CurrentSubject,
        { type: "user", id: user.id },
      )
    }),
  })
}))
