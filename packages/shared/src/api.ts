import { HttpApi, OpenApi } from "effect/unstable/httpapi"
import { AdminApi } from "./admin-api.js"
import { PublicApi } from "./public-api.js"

export { AdminApi } from "./admin-api.js"
export { PublicApi } from "./public-api.js"

export class ProxusApi extends HttpApi.make("proxusApi")
  .addHttpApi(PublicApi)
  .addHttpApi(AdminApi)
  .annotateMerge(
    OpenApi.annotations({
      title: "Proxus API",
      version: "0.1.0",
    }),
  ) {}
