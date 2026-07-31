import { makeCountryNodeId } from "@proxus/shared/study-catalog"
import { Effect, Layer } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/unstable/http"
import { describe, expect, it } from "vitest"
import { makePublicApiClientLayer } from "../public-api/client.js"
import { applicationRuntime } from "../runtime.js"
import {
  publicStudyCatalogChildrenQuery,
  publicStudyCatalogRootsQuery,
} from "./atoms.js"

const parentId = makeCountryNodeId("20000000-0000-4000-8000-000000000001")

describe("stable public Study Catalog queries", () => {
  it("use one typed query and one identity-keyed family", () => Effect.runPromise(Effect.gen(function*() {
    const requestedPaths: string[] = []
    const preprocess: HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never> = Effect.succeed
    const client = HttpClient.makeWith(
      Effect.fnUntraced(function*(requestEffect) {
        const request = yield* requestEffect
        requestedPaths.push(new URL(request.url, "http://test.local").pathname)
        return HttpClientResponse.fromWeb(request, new Response("[]", {
          status: 200,
          headers: { "content-type": "application/json" },
        }))
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
    const children = publicStudyCatalogChildrenQuery(parentId)
    expect(children).toBe(publicStudyCatalogChildrenQuery(parentId))
    registry.mount(publicStudyCatalogRootsQuery)
    registry.mount(children)
    yield* Effect.sleep("20 millis")

    expect(AsyncResult.getOrThrow(registry.get(publicStudyCatalogRootsQuery))).toEqual([])
    expect(AsyncResult.getOrThrow(registry.get(children))).toEqual([])
    expect(requestedPaths).toEqual([
      "/api/study-catalog/nodes/children",
      `/api/study-catalog/nodes/children/${parentId}`,
    ])
  })))
})
