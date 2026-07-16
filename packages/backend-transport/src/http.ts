import { PublicApi } from "@proxus/shared/public-api"
import { Layer } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { PublicStudyCatalogHandlers } from "./modules/study-catalog/http.js"

export const PublicApiRoutes = HttpApiBuilder.layer(PublicApi, {
  openapiPath: "/openapi.json",
}).pipe(Layer.provide(PublicStudyCatalogHandlers))
