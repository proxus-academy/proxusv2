import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { makeEmbeddedAdminWeb } from "./test/http/embedded.js"

describe("admin server surface", () => {
  test("does not expose public routes and documents only administrative paths", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const web = yield* makeEmbeddedAdminWeb
      const publicResponse = yield* Effect.promise(() => web.handler(new Request("http://proxus.test/study-catalog/countries")))
      expect(publicResponse.status).toBe(404)
      const response = yield* Effect.promise(() => web.handler(new Request("http://proxus.test/openapi.json")))
      expect(response.status).toBe(200)
      const document = (yield* Effect.promise(() => response.json())) as { paths: Record<string, unknown> }
      expect(document.paths["/admin/study-catalog/nodes"]).toBeDefined()
      expect(Object.keys(document.paths).some((path) => path.startsWith("/study-catalog/"))).toBe(false)
    }))),
  30_000)
})
