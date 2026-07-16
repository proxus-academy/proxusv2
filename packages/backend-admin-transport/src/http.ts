import { AdminApi } from "@proxus/shared/admin-api"
import { Layer } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { AdminStudyCatalogHandlers } from "./modules/study-catalog/http.js"

export const AdminApiRoutes = HttpApiBuilder.layer(AdminApi, {
  openapiPath: "/openapi.json",
}).pipe(Layer.provide(AdminStudyCatalogHandlers))
