import { HttpApi, OpenApi } from "effect/unstable/httpapi"
import { AdminStudyCatalogApi } from "./modules/study-catalog/api.js"

export class AdminApi extends HttpApi.make("adminApi")
  .add(AdminStudyCatalogApi)
  .annotateMerge(
    OpenApi.annotations({ title: "Proxus Admin API", version: "0.1.0" }),
  ) {}
