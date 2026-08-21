import { PublicApi } from "@proxus/shared/public-api"
import { Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { PublicAuthHandlers, PublicSessionHandlers, SessionAuthorizationLive } from "./modules/auth/http.js"
import { PublicFeatureFlagHandlers } from "./modules/feature-flags/http.js"
import { PublicProductAnalyticsHandlers } from "./modules/product-analytics/http.js"
import { PublicRealtimeHandlers } from "./modules/realtime/http.js"
import { PublicStudyCatalogHandlers } from "./modules/study-catalog/http.js"
import { PublicConversationsHandlers } from "./modules/conversations/http.js"

export const makePublicApiRoutes = (openapiPath: `/${string}` = "/openapi.json") => HttpApiBuilder.layer(PublicApi, {
  openapiPath,
}).pipe(
  Layer.provide(PublicAuthHandlers),
  Layer.provide(PublicSessionHandlers),
  Layer.provide(PublicRealtimeHandlers),
  Layer.provide(PublicStudyCatalogHandlers),
  Layer.provide(PublicFeatureFlagHandlers),
  Layer.provide(PublicProductAnalyticsHandlers),
  Layer.provide(PublicConversationsHandlers),
  Layer.provide(SessionAuthorizationLive),
)
export const PublicApiRoutes = makePublicApiRoutes()

/** Runtime roots may merge this route layer and narrow allowed origins for their environment. */
export const PublicCorsCredentials = HttpRouter.cors({
  allowedOrigins: ["http://localhost:5173"],
  allowedMethods: ["GET", "POST", "OPTIONS"],
  credentials: true,
})
