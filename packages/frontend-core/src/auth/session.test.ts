import { CurrentSession, Unauthorized } from "@proxus/shared/auth"
import { Effect, Layer, Schema } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/unstable/http"
import { describe, expect, it } from "vitest"
import { makePublicApiClientLayer } from "../public-api/client.js"
import { applicationRuntime } from "../runtime.js"
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

const httpLayer = (response: Response) => {
  const preprocess: HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never> = Effect.succeed
  return Layer.succeed(HttpClient.HttpClient, HttpClient.makeWith(
    Effect.fnUntraced(function*(requestEffect) {
      const request = yield* requestEffect
      return HttpClientResponse.fromWeb(request, response)
    }),
    preprocess,
  ))
}

const read = (response: Response) => Effect.gen(function*() {
  const registry = AtomRegistry.make({
    initialValues: [Atom.initialValue(
      applicationRuntime.layer,
      makePublicApiClientLayer("/api").pipe(Layer.provide(httpLayer(response))),
    )],
  })
  const unmount = registry.mount(currentSessionQuery)
  yield* Effect.sleep("10 millis")
  const result = registry.get(currentSessionQuery)
  unmount()
  return result
})

const jsonResponse = (cause: unknown, status = 200) => new Response(JSON.stringify(cause), {
  status,
  headers: { "content-type": "application/json" },
})

describe("currentSessionQuery", () => {
  it("loads the current server session", () => Effect.runPromise(Effect.gen(function*() {
    expect(AsyncResult.getOrThrow(yield* read(jsonResponse(session)))).toEqual(session)
  })))

  it("maps only unauthorized responses to an anonymous session", () => Effect.runPromise(Effect.gen(function*() {
    const unauthorized = Schema.encodeSync(Unauthorized)(new Unauthorized({}))
    expect(AsyncResult.getOrThrow(yield* read(jsonResponse(unauthorized, 401)))).toBeNull()
  })))

  it("keeps transport errors observable", () => Effect.runPromise(Effect.gen(function*() {
    expect(yield* read(new Response(null, { status: 500 }))).toMatchObject({ _tag: "Failure" })
  })))
})
