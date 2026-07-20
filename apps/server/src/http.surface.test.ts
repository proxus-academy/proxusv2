import {
  FeatureFlagSnapshotReaderLive,
  FeatureFlagSnapshotRepository,
} from "@proxus/backend-domain/feature-flags"
import {
  PgliteLive,
  PgliteMigrationLive,
} from "@proxus/backend-infra/database/pglite"
import { FeatureFlagSnapshotRepositoryPgliteLive } from "@proxus/backend-infra/feature-flags/pglite"
import { PublicFeatureFlagHandlers } from "@proxus/backend-transport/feature-flags"
import { PublicFeatureFlagsApi } from "@proxus/shared/feature-flags"
import { Context, Effect, Layer, Schema } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { describe, expect, test } from "vitest"
import { MaximumRequestBodySizeBytes } from "./http-body-limit.js"
import { makeEmbeddedPublicWeb } from "./test/http/embedded.js"

class FeatureFlagsOperationalApi extends HttpApi.make("publicApi")
  .add(PublicFeatureFlagsApi) {}

const makeOperationalFeatureFlags = Effect.gen(function*() {
  const PersistenceLive = Layer.merge(
    PgliteMigrationLive,
    FeatureFlagSnapshotRepositoryPgliteLive,
  ).pipe(Layer.provide(PgliteLive()))
  const persistence = yield* Layer.build(PersistenceLive)
  const repository = Context.get(
    persistence,
    FeatureFlagSnapshotRepository,
  )
  const reader = FeatureFlagSnapshotReaderLive.pipe(Layer.provide(
    Layer.succeed(FeatureFlagSnapshotRepository, repository),
  ))
  const routes = HttpApiBuilder.layer(FeatureFlagsOperationalApi).pipe(
    Layer.provide(PublicFeatureFlagHandlers),
    Layer.provide(reader),
    Layer.provide(HttpServer.layerServices),
  )
  const web = yield* Effect.acquireRelease(
    Effect.sync(() => HttpRouter.toWebHandler(routes, { disableLogger: true })),
    (handler) => Effect.promise(() => handler.dispose()),
  )
  return { repository, web }
})

const OpenApiDocumentJson = Schema.fromJsonString(Schema.Struct({
  paths: Schema.Record(Schema.String, Schema.Unknown),
}))

describe("public server surface", () => {
  test("does not expose administrative routes and documents only public paths", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const web = yield* makeEmbeddedPublicWeb
      const admin = yield* Effect.promise(() => web.handler(new Request("http://proxus.test/admin/study-catalog/nodes")))
      expect(admin.status).toBe(404)

      const response = yield* Effect.promise(() => web.handler(new Request("http://proxus.test/openapi.json")))
      expect(response.status).toBe(200)
      const document = yield* Schema.decodeUnknownEffect(OpenApiDocumentJson)(
        yield* Effect.promise(() => response.text()),
      )
      expect(document.paths["/study-catalog/countries"]).toBeDefined()
      expect(document.paths["/feature-flags/snapshot"]).toBeDefined()
      expect(Object.keys(document.paths).some((path) => path.startsWith("/admin/"))).toBe(false)

      const snapshot = yield* Effect.promise(() => web.handler(new Request("http://proxus.test/feature-flags/snapshot")))
      expect(snapshot.status).toBe(200)
      expect(snapshot.headers.get("cache-control")).toContain("max-age=60")
      const etag = snapshot.headers.get("etag")
      expect(etag).toBe('"feature-flags-0"')
      expect(yield* Effect.promise(() => snapshot.json())).toEqual({ configurationRevision: 0, flags: [] })
      if (etag === null) throw new Error("feature flag response omitted ETag")
      const unchanged = yield* Effect.promise(() => web.handler(new Request("http://proxus.test/feature-flags/snapshot", { headers: { "if-none-match": etag } })))
      expect(unchanged.status).toBe(304)
    }))),
  15_000)

  test("limits raw request bodies before decoding and accepts a normal analytics batch", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const web = yield* makeEmbeddedPublicWeb
      const normalBody = "{\"events\":[{\"_tag\":\"feature_flag_exposed\",\"flagKey\":\"registration.landing\",\"revision\":0,\"variant\":\"short\"}]}"
      const normal = yield* Effect.promise(() => web.handler(new Request(
        "http://proxus.test/product-analytics/events",
        {
          method: "POST",
          headers: {
            "content-length": String(normalBody.length),
            "content-type": "application/json",
          },
          body: normalBody,
        },
      )))
      expect(normal.status).toBe(200)
      expect(yield* Effect.promise(() => normal.json())).toEqual({
        accepted: 0,
        rejected: 1,
        reason: "no-consent",
      })

      const largeBody = `{\"padding\":\"${"x".repeat(MaximumRequestBodySizeBytes)}\"}`
      const tooLarge = yield* Effect.promise(() => web.handler(new Request(
        "http://proxus.test/product-analytics/events",
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

  test("publishes revision one and advances the HTTP validator from zero", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const { repository, web } = yield* makeOperationalFeatureFlags
      const initial = yield* Effect.promise(() => web.handler(
        new Request("http://proxus.test/feature-flags/snapshot"),
      ))
      expect(initial.status).toBe(200)
      expect(initial.headers.get("etag")).toBe('"feature-flags-0"')

      yield* repository.publish({ configurationRevision: 1, flags: [] })
      const published = yield* Effect.promise(() => web.handler(new Request(
        "http://proxus.test/feature-flags/snapshot",
        { headers: { "if-none-match": '"feature-flags-0"' } },
      )))
      expect(published.status).toBe(200)
      expect(published.headers.get("etag")).toBe('"feature-flags-1"')
      expect(yield* Effect.promise(() => published.json())).toEqual({
        configurationRevision: 1,
        flags: [],
      })

      const unchanged = yield* Effect.promise(() => web.handler(new Request(
        "http://proxus.test/feature-flags/snapshot",
        { headers: { "if-none-match": '"feature-flags-1"' } },
      )))
      expect(unchanged.status).toBe(304)
    }))),
  15_000)
})
