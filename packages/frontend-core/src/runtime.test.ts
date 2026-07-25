import { Effect, Layer } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/unstable/http"
import { describe, expect, it } from "vitest"
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

const clientProbe = applicationRuntime.atom(HttpClient.HttpClient)

describe("applicationRuntime", () => {
  it("runs the same atom with registry-specific HttpClient Layers", () => {
    const first = makeClient()
    const second = makeClient()
    const firstRegistry = AtomRegistry.make({
      initialValues: [Atom.initialValue(applicationRuntime.layer, Layer.succeed(HttpClient.HttpClient, first))],
    })
    const secondRegistry = AtomRegistry.make({
      initialValues: [Atom.initialValue(applicationRuntime.layer, Layer.succeed(HttpClient.HttpClient, second))],
    })

    firstRegistry.mount(clientProbe)
    secondRegistry.mount(clientProbe)
    expect(AsyncResult.getOrThrow(firstRegistry.get(clientProbe))).toBe(first)
    expect(AsyncResult.getOrThrow(secondRegistry.get(clientProbe))).toBe(second)
  })

  it("fails when the registry does not provide the application Layer", () => Effect.runPromise(Effect.gen(function*() {
    const registry = AtomRegistry.make()
    const unmount = registry.mount(clientProbe)
    yield* Effect.sleep("10 millis")
    expect(registry.get(clientProbe)).toMatchObject({ _tag: "Failure" })
    unmount()
  })))
})
