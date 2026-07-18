import { HttpApi, OpenApi } from "effect/unstable/httpapi"
import { PublicFeatureFlagsApi } from "./modules/feature-flags/api.js"
import { PublicProductAnalyticsApi } from "./modules/product-analytics/api.js"
import { PublicRealtimeApi } from "./modules/realtime/api.js"
import { PublicStudyCatalogApi } from "./modules/study-catalog/api.js"

export class PublicApi extends HttpApi.make("publicApi")
  .add(PublicStudyCatalogApi)
  .add(PublicFeatureFlagsApi)
  .add(PublicProductAnalyticsApi)
  .add(PublicRealtimeApi)
  .annotateMerge(
    OpenApi.annotations({ title: "Proxus Public API", version: "0.1.0" }),
  ) {}
