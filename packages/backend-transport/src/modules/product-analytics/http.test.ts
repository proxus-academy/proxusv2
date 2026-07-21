import { ProductAnalytics } from "@proxus/backend-domain/product-analytics"
import {
  FeatureFlagExposed,
  PublicProductAnalyticsApi,
  RecordProductAnalyticsBatchRequest,
  RecordProductAnalyticsBatchResponse,
} from "@proxus/shared/product-analytics"
import { Effect, Layer, Schema } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { describe, expect, test } from "vitest"
import {
  ProductAnalyticsHttpContext,
  PublicProductAnalyticsHandlers,
} from "./http.js"

class ProductAnalyticsTestApi extends HttpApi.make("publicApi")
  .add(PublicProductAnalyticsApi) {}

const makeWeb = Effect.acquireRelease(
  Effect.sync(() => {
    const routes = HttpApiBuilder.layer(ProductAnalyticsTestApi).pipe(
      Layer.provide(PublicProductAnalyticsHandlers),
      Layer.provide(Layer.succeed(ProductAnalytics, ProductAnalytics.of({
        recordBatch: (events) => Effect.succeed({
          accepted: events.length,
          rejected: 0,
        }),
      }))),
      Layer.provide(Layer.succeed(
        ProductAnalyticsHttpContext,
        ProductAnalyticsHttpContext.of({
          resolve: () => Effect.succeed({
            consent: "granted",
            flagSubjectId: "00000000-0000-4000-8000-000000000001",
          }),
        }),
      )),
      Layer.provide(HttpServer.layerServices),
    )
    return HttpRouter.toWebHandler(routes, { disableLogger: true })
  }),
  (web) => Effect.promise(() => web.dispose()),
)

const validBatchBody = Schema.encodeSync(
  Schema.fromJsonString(RecordProductAnalyticsBatchRequest),
)(new RecordProductAnalyticsBatchRequest({
  events: [new FeatureFlagExposed({
    flagKey: "registration.landing",
    revision: 0,
    variant: "short",
  })],
}))

describe("product analytics HTTP", () => {
  test("encodes the service result as the declared batch response", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const web = yield* makeWeb
      const response = yield* Effect.promise(() => web.handler(new Request(
        "http://proxus.test/product-analytics/events",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: validBatchBody,
        },
      )))

      expect(response.status).toBe(200)
      expect(yield* Effect.promise(() => response.json())).toEqual(
        new RecordProductAnalyticsBatchResponse({
          accepted: 1,
          rejected: 0,
        }),
      )
    }))))
})
