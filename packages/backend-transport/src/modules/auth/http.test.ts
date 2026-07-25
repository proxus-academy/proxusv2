// @effect-diagnostics globalDate:off globalDateInEffect:off asyncFunction:off globalConsole:off
import { AuthenticationService, UnauthorizedSession, makeSessionId, makeUserId, type IssuedSession } from "@proxus/backend-domain/auth"
import { CurrentSession, EmailAddress, SessionApi, Username, makeAccountId, makeSessionId as makeWireSessionId } from "@proxus/shared/auth"
import { DateTime, Effect, Layer, Schema } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder, OpenApi } from "effect/unstable/httpapi"
import { describe, expect, test } from "vitest"
import { AuthSessionView, PublicSessionHandlers, SessionAuthorizationLive, makeAuthSessionCookies } from "./http.js"

class SessionTestApi extends HttpApi.make("publicApi").add(SessionApi) {}
const expires = new Date("2030-01-01T00:00:00.000Z")
const issued = (token: string): IssuedSession => ({
  token,
  session: {
    id: makeSessionId("00000000-0000-4000-8000-000000000001"),
    userId: makeUserId("00000000-0000-4000-8000-000000000002"),
    tokenHash: "not-a-secret", previousTokenHash: null, previousTokenValidUntil: null,
    expiresAt: expires, revokedAt: null, createdAt: new Date("2029-01-01T00:00:00.000Z"),
  },
})
const current = new CurrentSession({
  sessionId: makeWireSessionId("00000000-0000-4000-8000-000000000001"),
  account: {
    id: makeAccountId("00000000-0000-4000-8000-000000000002"),
    email: Schema.decodeUnknownSync(EmailAddress)("safe@example.test"), username: Schema.decodeUnknownSync(Username)("safe_user"), status: "active", provider: "email",
  },
  expiresAt: DateTime.makeUnsafe(expires.getTime()),
})

const makeWeb = (rotate: boolean) => {
  const authentication = Layer.succeed(AuthenticationService, AuthenticationService.of({
    loginWithPassword: () => Effect.succeed(issued("new-secret")),
    requestPasswordReset: () => Effect.void,
    resetPassword: () => Effect.void,
    currentSession: (token) => token === "valid-secret" ? Effect.succeed(issued(rotate ? "rotated-secret" : token)) : Effect.fail(new UnauthorizedSession()),
    logout: () => Effect.void,
    logoutSession: () => Effect.void,
  }))
  const view = Layer.succeed(AuthSessionView, AuthSessionView.of({
    fromIssued: () => Effect.succeed(current),
    account: () => Effect.succeed(current.account),
  }))
  const dependencies = Layer.mergeAll(authentication, view, makeAuthSessionCookies({ secure: true, sameSite: "lax" }))
  const routes = HttpApiBuilder.layer(SessionTestApi).pipe(
    Layer.provide(PublicSessionHandlers),
    Layer.provide(SessionAuthorizationLive),
    Layer.provide(dependencies),
    Layer.provide(HttpServer.layerServices),
  )
  return HttpRouter.toWebHandler(routes, { disableLogger: true })
}

describe("public auth session transport", () => {
  test("has no refresh endpoint", () => {
    const paths = OpenApi.fromApi(SessionTestApi).paths
    expect(paths["/auth/refresh"]).toBeUndefined()
  })

  test("returns 401 and expires an absent/invalid cookie", async () => {
    const web = makeWeb(false)
    const response = await web.handler(new Request("http://proxus.test/auth/session"))
    expect(response.status).toBe(401)
    expect(response.headers.get("set-cookie")).toContain("proxus_session=")
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0")
    await web.dispose()
  })

  test("rotates transparently with secure HttpOnly SameSite cookie and no token body", async () => {
    const web = makeWeb(true)
    const response = await web.handler(new Request("http://proxus.test/auth/session", { headers: { cookie: "proxus_session=valid-secret" } }))
    expect(response.status).toBe(200)
    const cookie = response.headers.get("set-cookie") ?? ""
    expect(cookie).toContain("proxus_session=rotated-secret")
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("Secure")
    expect(cookie).toContain("SameSite=Lax")
    expect(await response.text()).not.toContain("rotated-secret")
    await web.dispose()
  })
})
