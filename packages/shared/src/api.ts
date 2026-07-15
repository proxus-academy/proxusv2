import { HttpApi, OpenApi } from "effect/unstable/httpapi"
import {
  AdminStudyCatalogApi,
  PublicStudyCatalogApi,
} from "./modules/study-catalog/api.js"

export class ProxusApi extends HttpApi.make("proxusApi")
  .add(PublicStudyCatalogApi)
  .add(AdminStudyCatalogApi)
  .annotateMerge(
    OpenApi.annotations({
      title: "Proxus API",
      version: "0.1.0",
    }),
  ) {}
