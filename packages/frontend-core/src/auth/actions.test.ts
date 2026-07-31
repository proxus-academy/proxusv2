import { CurrentSession, Unauthorized } from "@proxus/shared/auth"
import { Effect, Layer, Schema } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/unstable/http"
import { describe, expect, it } from "vitest"
import { makePublicApiClientLayer } from "../public-api/client.js"
import { applicationRuntime } from "../runtime.js"
import { logoutAction } from "./actions.js"
import { currentSessionQuery } from "./session.js"

const session = Schema.decodeUnknownSync(CurrentSession)({
  sessionId: "00000000-0000-4000-8000-000000000002",
  account: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "student@example.com",
    username: "student_1",
    status: "active",
    provider: "email",
  },
  expiresAt: "2030-01-01T00:00:00.000Z",
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
})

describe("logoutAction", () => {
  it("invalidates the server-owned session after logout", () => Effect.runPromise(Effect.gen(function*() {
    let authenticated = true
    const preprocess: HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never> = Effect.succeed
    const client = HttpClient.makeWith(
      Effect.fnUntraced(function*(requestEffect) {
        const request = yield* requestEffect
        const path = new URL(request.url, "http://test.local").pathname
        const response = path === "/api/auth/logout"
          ? (authenticated = false, new Response(null, { status: 204 }))
          : authenticated
            ? json(session)
            : json(Schema.encodeSync(Unauthorized)(new Unauthorized({})), 401)
        return HttpClientResponse.fromWeb(request, response)
      }),
      preprocess,
    )
    const registry = AtomRegistry.make({
      initialValues: [Atom.initialValue(
        applicationRuntime.layer,
        Layer.merge(
          makePublicApiClientLayer("/api").pipe(
            Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
          ),
          Reactivity.layer,
        ),
      )],
    })
    registry.mount(currentSessionQuery)
    registry.mount(logoutAction)

    yield* Effect.sleep("10 millis")
    expect(AsyncResult.getOrThrow(registry.get(currentSessionQuery))).toEqual(session)

    registry.set(logoutAction, undefined)
    yield* Effect.sleep("20 millis")
    expect(registry.get(logoutAction)).toMatchObject({ _tag: "Success" })
    expect(AsyncResult.getOrThrow(registry.get(currentSessionQuery))).toBeNull()
  })))
})
