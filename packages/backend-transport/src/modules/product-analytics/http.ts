import { ProductAnalytics, type ProductAnalyticsContext } from "@proxus/backend-domain/product-analytics"
import { PublicApi } from "@proxus/shared/public-api"
import { Context, Effect, Layer } from "effect"
import { HttpServerRequest } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"

/** Transport seam for middleware-verified consent and server identity. */
export class ProductAnalyticsHttpContext extends Context.Service<ProductAnalyticsHttpContext, {
  readonly resolve: (request: HttpServerRequest.HttpServerRequest) => Effect.Effect<ProductAnalyticsContext>
}>()("@proxus/backend-transport/modules/product-analytics/http/ProductAnalyticsHttpContext") {}

/** Safe production default until approved consent/session middleware exists. */
export const ProductAnalyticsHttpContextFailClosed = Layer.succeed(ProductAnalyticsHttpContext, {
  resolve: () => Effect.succeed({ consent: "unknown" }),
})
const isSameOriginDevelopmentRequest = (request: HttpServerRequest.HttpServerRequest) => {
  const origin = request.headers.origin
  const host = request.headers.host
  if (origin === undefined || host === undefined || request.headers["sec-fetch-site"] !== "same-origin") return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** Development-only opt-in; requires browser same-origin evidence and is never composed in production. */
export const ProductAnalyticsHttpContextDevelopment = Layer.succeed(ProductAnalyticsHttpContext, {
  resolve: (request) => {
    const flagSubjectId = request.headers["x-proxus-dev-flag-subject"]
    return Effect.succeed({
      consent: request.headers["x-proxus-dev-analytics-consent"] === "granted" && isSameOriginDevelopmentRequest(request) ? "granted" : "unknown",
      ...(flagSubjectId === undefined ? {} : { flagSubjectId }),
    })
  },
})

export const PublicProductAnalyticsHandlers = HttpApiBuilder.group(PublicApi, "productAnalytics", Effect.fn(function* (handlers) {
  const analytics = yield* ProductAnalytics
  const context = yield* ProductAnalyticsHttpContext
  return handlers.handle("recordBatch", ({ payload }) => Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    return yield* analytics.recordBatch(payload.events, yield* context.resolve(request))
  }))
}))
