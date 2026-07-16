import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { makeEmbeddedPublicClient } from "./test/http/embedded.js"

describe("public embedded HTTP API", () => {
  test("runs public operations through handlers, service and PGlite", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const client = yield* makeEmbeddedPublicClient
      expect(yield* client.publicStudyCatalog.listCountries()).toEqual([])
      expect(yield* client.publicStudyCatalog.listRoots()).toEqual([])
    }))),
  15_000)
})
