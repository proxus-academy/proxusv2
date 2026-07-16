import { HttpApi, OpenApi } from "effect/unstable/httpapi"
import { PublicProductAnalyticsApi } from "./modules/product-analytics/api.js"
import {
  AdminStudyCatalogApi,
  PublicStudyCatalogApi,
} from "./modules/study-catalog/api.js"

export { AdminApi } from "./admin-api.js"
export { PublicApi } from "./public-api.js"

export class ProxusApi extends HttpApi.make("proxusApi")
  .add(PublicStudyCatalogApi)
  .add(PublicProductAnalyticsApi)
  .add(AdminStudyCatalogApi)
  .annotateMerge(
    OpenApi.annotations({
      title: "Proxus API",
      version: "0.1.0",
    }),
  ) {}
