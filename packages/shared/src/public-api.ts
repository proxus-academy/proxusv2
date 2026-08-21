import { HttpApi, OpenApi } from "effect/unstable/httpapi"
import { AuthApi, SessionApi } from "./modules/auth/api.js"
import { PublicFeatureFlagsApi } from "./modules/feature-flags/api.js"
import { PublicProductAnalyticsApi } from "./modules/product-analytics/api.js"
import { PublicRealtimeApi } from "./modules/realtime/api.js"
import { PublicStudyCatalogApi } from "./modules/study-catalog/api.js"
import { PublicConversationsApi } from "./modules/conversations/api.js"

export class PublicApi extends HttpApi.make("publicApi")
  .add(AuthApi)
  .add(SessionApi)
  .add(PublicStudyCatalogApi)
  .add(PublicFeatureFlagsApi)
  .add(PublicProductAnalyticsApi)
  .add(PublicRealtimeApi)
  .add(PublicConversationsApi)
  .annotateMerge(
    OpenApi.annotations({ title: "Proxus Public API", version: "0.1.0" }),
  ) {}
