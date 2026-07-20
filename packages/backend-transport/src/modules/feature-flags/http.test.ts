import {
  FeatureFlagSnapshotReader,
  FeatureFlagSnapshotRepositoryError,
} from "@proxus/backend-domain/feature-flags"
import {
  FeatureFlagSnapshot,
  PublicFeatureFlagsApi,
} from "@proxus/shared/feature-flags"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { describe, expect, test } from "vitest"
import {
  featureFlagEtagFor,
  ifNoneMatchMatches,
  PublicFeatureFlagHandlers,
} from "./http.js"

class FeatureFlagsTestApi extends HttpApi.make("publicApi").add(PublicFeatureFlagsApi) {}

const makeWeb = (
  getActiveSnapshot: () => Effect.Effect<FeatureFlagSnapshot, FeatureFlagSnapshotRepositoryError>,
) => {
  const reader = Layer.succeed(
    FeatureFlagSnapshotReader,
    FeatureFlagSnapshotReader.of({ getActiveSnapshot }),
  )
  const routes = HttpApiBuilder.layer(FeatureFlagsTestApi).pipe(
    Layer.provide(PublicFeatureFlagHandlers),
    Layer.provide(reader),
    Layer.provide(HttpServer.layerServices),
  )
  return Effect.acquireRelease(
    Effect.sync(() => HttpRouter.toWebHandler(routes, { disableLogger: true })),
    (web) => Effect.promise(() => web.dispose()),
  )
}

const snapshot: FeatureFlagSnapshot = {
  configurationRevision: 7,
  flags: [],
}

describe("feature flag conditional requests", () => {
  const current = featureFlagEtagFor(7)

  test.each([
    current,
    `W/${current}`,
    `"other", ${current}`,
    `W/"other", W/${current}`,
    `"opaque,comma", ${current}`,
    "*",
  ])("uses weak If-None-Match comparison for %s", (header) => {
    expect(ifNoneMatchMatches(header, current)).toBe(true)
  })

  test.each([
    undefined,
    '"other"',
    'W/"other"',
    "not-an-etag",
    `${current},`,
    `*, ${current}`,
  ])("does not match %s", (header) => {
    expect(ifNoneMatchMatches(header, current)).toBe(false)
  })

  test("serves 200 and 304 through the in-process schema-first handler", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const web = yield* makeWeb(() => Effect.succeed(snapshot))
      const response = yield* Effect.promise(() => web.handler(
        new Request("http://proxus.test/feature-flags/snapshot"),
      ))
      expect(response.status).toBe(200)
      expect(response.headers.get("etag")).toBe(current)
      expect(response.headers.get("cache-control")).toBe(
        "public, max-age=60, stale-while-revalidate=300",
      )
      expect(yield* Effect.promise(() => response.json())).toEqual(snapshot)

      const unchanged = yield* Effect.promise(() => web.handler(new Request(
        "http://proxus.test/feature-flags/snapshot",
        { headers: { "if-none-match": `W/${current}` } },
      )))
      expect(unchanged.status).toBe(304)
      expect(unchanged.headers.get("etag")).toBe(current)
      expect(yield* Effect.promise(() => unchanged.text())).toBe("")
    }))))

  test("maps repository failures to a safe bodyless 500", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const repositoryFailure = yield* makeWeb(() => Effect.fail(
        new FeatureFlagSnapshotRepositoryError({
          operation: "readActive",
          cause: new Error("sensitive database detail"),
        }),
      ))
      const failed = yield* Effect.promise(() => repositoryFailure.handler(
        new Request("http://proxus.test/feature-flags/snapshot"),
      ))
      expect(failed.status).toBe(500)
      expect(yield* Effect.promise(() => failed.text())).toBe("")
    }))))
})
