import { ProxusApi } from "@proxus/shared/api"
import { Layer } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import {
  AdminStudyCatalogHandlers,
  PublicStudyCatalogHandlers,
} from "./modules/study-catalog/http.js"

export const ProxusApiRoutes = HttpApiBuilder.layer(ProxusApi, {
  openapiPath: "/openapi.json",
}).pipe(
  Layer.provide([
    PublicStudyCatalogHandlers,
    AdminStudyCatalogHandlers,
  ]),
)
