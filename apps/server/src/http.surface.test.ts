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
      expect(document.paths["/feature-flags/snapshot"]).toBeDefined()
      expect(Object.keys(document.paths).some((path) => path.startsWith("/admin/"))).toBe(false)

      const snapshot = yield* Effect.promise(() => web.handler(new Request("http://proxus.test/feature-flags/snapshot")))
      expect(snapshot.status).toBe(200)
      expect(snapshot.headers.get("cache-control")).toContain("max-age=60")
      const etag = snapshot.headers.get("etag")
      expect(etag).toBe('"feature-flags-0"')
      expect(yield* Effect.promise(() => snapshot.json())).toEqual({ configurationRevision: 0, flags: [] })
      const unchanged = yield* Effect.promise(() => web.handler(new Request("http://proxus.test/feature-flags/snapshot", { headers: { "if-none-match": etag! } })))
      expect(unchanged.status).toBe(304)
    }))),
  15_000)
})
