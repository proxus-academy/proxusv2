import { HttpApi, OpenApi } from "effect/unstable/httpapi"
import { PublicStudyCatalogApi } from "./modules/study-catalog/api.js"

export class PublicApi extends HttpApi.make("publicApi")
  .add(PublicStudyCatalogApi)
  .annotateMerge(
    OpenApi.annotations({ title: "Proxus Public API", version: "0.1.0" }),
  ) {}
