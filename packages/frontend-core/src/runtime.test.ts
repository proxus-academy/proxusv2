import { Effect, Layer } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/unstable/http"
import { describe, expect, it } from "vitest"
import { makePublicApiClientLayer, PublicApiClient } from "./public-api/client.js"
import { applicationRuntime } from "./runtime.js"

const makeClient = () => {
  const preprocess: HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never> = Effect.succeed
  return HttpClient.makeWith(
    Effect.fnUntraced(function*(requestEffect) {
      const request = yield* requestEffect
      return HttpClientResponse.fromWeb(request, new Response(null, { status: 204 }))
    }),
    preprocess,
  )
}

const clientProbe = applicationRuntime.atom(PublicApiClient)
const applicationLayer = (client: HttpClient.HttpClient, baseUrl = "/api") =>
  makePublicApiClientLayer(baseUrl).pipe(
    Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
  )

describe("applicationRuntime", () => {
  it("runs the same atom with registry-specific configured public clients", () => {
    const first = makeClient()
    const second = makeClient()
    const firstRegistry = AtomRegistry.make({
      initialValues: [Atom.initialValue(applicationRuntime.layer, applicationLayer(first, "https://first.example/api"))],
    })
    const secondRegistry = AtomRegistry.make({
      initialValues: [Atom.initialValue(applicationRuntime.layer, applicationLayer(second, "https://second.example/api"))],
    })

    firstRegistry.mount(clientProbe)
    secondRegistry.mount(clientProbe)
    const firstPublicClient = AsyncResult.getOrThrow(firstRegistry.get(clientProbe))
    const secondPublicClient = AsyncResult.getOrThrow(secondRegistry.get(clientProbe))
    expect(firstPublicClient).not.toBe(secondPublicClient)
    expect(firstPublicClient.authSession.currentSession).not.toBe(secondPublicClient.authSession.currentSession)
  })

  it("fails when the registry does not provide the application Layer", () => Effect.runPromise(Effect.gen(function*() {
    const registry = AtomRegistry.make()
    const unmount = registry.mount(clientProbe)
    yield* Effect.sleep("10 millis")
    expect(registry.get(clientProbe)).toMatchObject({ _tag: "Failure" })
    unmount()
  })))
})
