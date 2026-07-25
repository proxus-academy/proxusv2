import { Effect, Schema } from "effect"
import { describe, expect, test } from "vitest"
import { MaximumRequestBodySizeBytes } from "./http-body-limit.js"
import { makeEmbeddedAdminWeb } from "./test/http/embedded.js"

const OpenApiDocumentJson = Schema.fromJsonString(Schema.Struct({
  paths: Schema.Record(Schema.String, Schema.Unknown),
}))

describe("admin server surface", () => {
  test("limits raw request bodies before decoding and rejects an anonymous normal mutation", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const web = yield* makeEmbeddedAdminWeb
      const normalBody = "{\"_tag\":\"CreateCountry\",\"name\":\"España\"}"
      const normal = yield* Effect.promise(() => web.handler(new Request(
        "http://proxus.test/admin/study-catalog/nodes",
        {
          method: "POST",
          headers: {
            "content-length": String(new TextEncoder().encode(normalBody).byteLength),
            "content-type": "application/json",
          },
          body: normalBody,
        },
      )))
      expect(normal.status).toBe(401)

      const largeBody = `{\"padding\":\"${"x".repeat(MaximumRequestBodySizeBytes)}\"}`
      const tooLarge = yield* Effect.promise(() => web.handler(new Request(
        "http://proxus.test/admin/study-catalog/nodes",
        {
          method: "POST",
          headers: {
            "content-length": String(largeBody.length),
            "content-type": "application/json",
          },
          body: largeBody,
        },
      )))
      expect(tooLarge.status).toBe(413)
      expect(yield* Effect.promise(() => tooLarge.text())).toBe("")
    }))),
  15_000)

  test("does not expose public routes and documents only administrative paths", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const web = yield* makeEmbeddedAdminWeb
      const publicResponse = yield* Effect.promise(() => web.handler(new Request("http://proxus.test/study-catalog/countries")))
      expect(publicResponse.status).toBe(404)
      const response = yield* Effect.promise(() => web.handler(new Request("http://proxus.test/openapi.json")))
      expect(response.status).toBe(200)
      const document = yield* Schema.decodeUnknownEffect(OpenApiDocumentJson)(
        yield* Effect.promise(() => response.text()),
      )
      expect(document.paths["/admin/study-catalog/nodes"]).toBeDefined()
      expect(Object.keys(document.paths).some((path) => path.startsWith("/study-catalog/"))).toBe(false)
    }))),
  15_000)
})
