import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { makeEmbeddedPublicWeb } from "./test/http/embedded.js"

describe("public server surface", () => {
  test("does not expose administrative routes and documents only public paths", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const web = yield* makeEmbeddedPublicWeb
      const admin = yield* Effect.promise(() => web.handler(new Request("http://proxus.test/admin/study-catalog/nodes")))
      expect(admin.status).toBe(404)

      const response = yield* Effect.promise(() => web.handler(new Request("http://proxus.test/openapi.json")))
      expect(response.status).toBe(200)
      const document = (yield* Effect.promise(() => response.json())) as { paths: Record<string, unknown> }
      expect(document.paths["/study-catalog/countries"]).toBeDefined()
      expect(Object.keys(document.paths).some((path) => path.startsWith("/admin/"))).toBe(false)
    }))),
  15_000)
})
