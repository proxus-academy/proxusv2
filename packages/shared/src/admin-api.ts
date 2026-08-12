import { HttpApi, OpenApi } from "effect/unstable/httpapi"
import { AdminStudyCatalogApi } from "./modules/study-catalog/api.js"
import { AdminAgentRunsApi } from "./modules/agent-runs/api.js"

export class AdminApi extends HttpApi.make("adminApi")
  .add(AdminStudyCatalogApi)
  .add(AdminAgentRunsApi)
  .annotateMerge(
    OpenApi.annotations({ title: "Proxus Admin API", version: "0.1.0" }),
  ) {}
