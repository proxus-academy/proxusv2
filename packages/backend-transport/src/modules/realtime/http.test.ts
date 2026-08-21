// @effect-diagnostics globalDate:off asyncFunction:off
import { RealtimeSource } from "@proxus/backend-domain/realtime"
import { CurrentSession, CurrentUser, EmailAddress, SessionAuthorization, Unauthorized, Username, makeAccountId, makeSessionId } from "@proxus/shared/auth"
import { PublicRealtimeApi, SessionRefreshRequired } from "@proxus/shared/realtime"
import { DateTime, Effect, Layer, Redacted, Schema, Stream } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { describe, expect, it } from "vitest"
import { PublicRealtimeHandlers } from "./http.js"

class RealtimeTestApi extends HttpApi.make("publicApi").add(PublicRealtimeApi) {}

const accountId = makeAccountId("00000000-0000-4000-8000-000000000002")
const current = new CurrentSession({
  sessionId: makeSessionId("00000000-0000-4000-8000-000000000001"),
  account: {
    id: accountId,
    email: Schema.decodeUnknownSync(EmailAddress)("safe@example.test"),
    username: Schema.decodeUnknownSync(Username)("safe_user"),
    status: "active",
    provider: "email",
  },
  expiresAt: DateTime.makeUnsafe(new Date("2030-01-01T00:00:00.000Z").getTime()),
})

const makeWeb = () => {
  const authorization = Layer.succeed(SessionAuthorization, SessionAuthorization.of({
    session: (httpEffect, { credential }) => Redacted.value(credential) === "valid-secret"
      ? Effect.provideService(httpEffect, CurrentUser, current)
      : Effect.fail(new Unauthorized({})),
  }))
  const source = Layer.succeed(RealtimeSource, RealtimeSource.of({
    forAccount: (requested) => requested === accountId
      ? Stream.make({
          eventId: "event-1",
          accountId,
          event: new SessionRefreshRequired({ version: 1 }),
        })
      : Stream.empty,
  }))
  const routes = HttpApiBuilder.layer(RealtimeTestApi).pipe(
    Layer.provide(PublicRealtimeHandlers),
    Layer.provide(authorization),
    Layer.provide(source),
    Layer.provide(HttpServer.layerServices),
  )
  return HttpRouter.toWebHandler(routes, { disableLogger: true })
}

describe("public realtime transport", () => {
  it("requires a session and streams the account event with SSE headers", async () => {
    const web = makeWeb()
    const unauthorized = await web.handler(new Request("http://proxus.test/events"))
    expect(unauthorized.status).toBe(401)

    const response = await web.handler(new Request("http://proxus.test/events", {
      headers: { cookie: "proxus_session=valid-secret" },
    }))
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")
    expect(response.headers.get("cache-control")).toBe("no-cache, no-store")
    expect(response.headers.get("x-accel-buffering")).toBe("no")
    const reader = response.body?.getReader()
    const first = await reader?.read()
    expect(new TextDecoder().decode(first?.value)).toContain("event: session.refresh-required")
    expect(new TextDecoder().decode(first?.value)).toContain("session.refresh-required")
    await reader?.cancel()
    await web.dispose()
  })
})
