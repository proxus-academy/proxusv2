import { HttpApi, OpenApi } from "effect/unstable/httpapi"
import { AuthApi, SessionApi } from "./modules/auth/api.js"
import { PublicFeatureFlagsApi } from "./modules/feature-flags/api.js"
import { PublicProductAnalyticsApi } from "./modules/product-analytics/api.js"
import { PublicStudyCatalogApi } from "./modules/study-catalog/api.js"
import { PublicUgcApi } from "./modules/ugc-management/api.js"

export class PublicApi extends HttpApi.make("publicApi")
  .add(AuthApi)
  .add(SessionApi)
  .add(PublicStudyCatalogApi)
  .add(PublicFeatureFlagsApi)
  .add(PublicProductAnalyticsApi)
  .add(PublicUgcApi)
  .annotateMerge(
    OpenApi.annotations({ title: "Proxus Public API", version: "0.1.0" }),
  ) {}
