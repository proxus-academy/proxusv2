import { AdminApi } from "@proxus/shared/admin-api"
import { Layer } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { AdminAccessControlHandlers } from "./modules/access-control/http.js"
import { AdminStudyCatalogHandlers } from "./modules/study-catalog/http.js"
import { AdminUsersHandlers } from "./modules/admin-users/http.js"
import { AdminAiOperationsHandlers } from "./modules/ai-operations/http.js"

export const makeAdminApiRoutes = (openapiPath: `/${string}` = "/openapi.json") => HttpApiBuilder.layer(AdminApi, {
  openapiPath,
}).pipe(Layer.provide(Layer.mergeAll(AdminStudyCatalogHandlers, AdminAccessControlHandlers, AdminUsersHandlers, AdminAiOperationsHandlers)))
export const AdminApiRoutes = makeAdminApiRoutes()
