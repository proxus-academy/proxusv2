import {
  AuthRequestAccepted,
  GoogleAuthorization,
  RequestPasswordResetInput,
} from "@proxus/shared/auth"
import { Effect, Layer, Schema } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/unstable/http"
import { describe, expect, it } from "vitest"
import { makePublicApiClientLayer } from "../public-api/client.js"
import { applicationRuntime } from "../runtime.js"
import {
  requestPasswordResetAction,
  startGoogleAuthorizationAction,
} from "./actions.js"

const authorization = new GoogleAuthorization({
  authorizationUrl: "https://accounts.example.test/authorize?state=signed",
})
const accepted = new AuthRequestAccepted({ accepted: true })
const json = (cause: unknown, status = 200) => new Response(JSON.stringify(cause), {
  status,
  headers: { "content-type": "application/json" },
})

describe("stable public auth actions", () => {
  it("use the typed PublicApi client through applicationRuntime", () => Effect.runPromise(Effect.gen(function*() {
    const requestedPaths: string[] = []
    const preprocess: HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never> = Effect.succeed
    const client = HttpClient.makeWith(
      Effect.fnUntraced(function*(requestEffect) {
        const request = yield* requestEffect
        const path = new URL(request.url, "http://test.local").pathname
        requestedPaths.push(path)
        const response = path === "/api/auth/google/start"
          ? json(authorization)
          : json(accepted, 202)
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
    registry.mount(startGoogleAuthorizationAction)
    registry.mount(requestPasswordResetAction)

    registry.set(startGoogleAuthorizationAction, { requestId: "request-1" })
    registry.set(
      requestPasswordResetAction,
      Schema.decodeUnknownSync(RequestPasswordResetInput)({ email: "student@example.com" }),
    )
    yield* Effect.sleep("20 millis")

    expect(AsyncResult.getOrThrow(registry.get(startGoogleAuthorizationAction))).toEqual(authorization)
    expect(AsyncResult.getOrThrow(registry.get(requestPasswordResetAction))).toEqual(accepted)
    expect(requestedPaths).toEqual([
      "/api/auth/google/start",
      "/api/auth/password-reset/request",
    ])
  })))
})
