import { HttpApi, OpenApi } from "effect/unstable/httpapi"
import { AdminAccessControlApi } from "./modules/access-control/api.js"
import { AdminStudyCatalogApi } from "./modules/study-catalog/api.js"
import { AdminUsersApi } from "./modules/admin-users/api.js"

export class AdminApi extends HttpApi.make("adminApi")
  .add(AdminStudyCatalogApi)
  .add(AdminAccessControlApi)
  .add(AdminUsersApi)
  .annotateMerge(
    OpenApi.annotations({ title: "Proxus Admin API", version: "0.1.0" }),
  ) {}
