import { PublicApi } from "@proxus/shared/public-api"
import { Layer } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { PublicFeatureFlagHandlers } from "./modules/feature-flags/http.js"
import { PublicProductAnalyticsHandlers } from "./modules/product-analytics/http.js"
import { PublicStudyCatalogHandlers } from "./modules/study-catalog/http.js"

export const PublicApiRoutes = HttpApiBuilder.layer(PublicApi, {
  openapiPath: "/openapi.json",
}).pipe(
  Layer.provide(PublicStudyCatalogHandlers),
  Layer.provide(PublicFeatureFlagHandlers),
  Layer.provide(PublicProductAnalyticsHandlers),
)
