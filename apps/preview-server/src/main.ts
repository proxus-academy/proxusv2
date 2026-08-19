// Platform seam required by NodeHttpServer.layerConfig.
// @effect-diagnostics-next-line nodeBuiltinImport:off
// eslint-disable-next-line no-restricted-imports -- NodeHttpServer.layerConfig requires the Node server constructor at this composition root.
import { createServer } from "node:http"
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import { makeAdminApiRoutes } from "@proxus/backend-admin-transport"
import { makePublicApiRoutes } from "@proxus/backend-transport"
import { Config, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { PreviewPublicSupportLive, PreviewServicesLive } from "./services.js"

const publicRoutes = makePublicApiRoutes("/openapi.public.json").pipe(Layer.provide(
  Layer.merge(PreviewServicesLive, PreviewPublicSupportLive),
))
const adminRoutes = makeAdminApiRoutes("/openapi.admin.json").pipe(Layer.provide(PreviewServicesLive))
const server = NodeHttpServer.layerConfig(createServer, {
  host: Config.string("API_HOST").pipe(Config.withDefault("127.0.0.1")),
  port: Config.int("API_PORT").pipe(Config.withDefault(3000)),
})

HttpRouter.serve(Layer.merge(publicRoutes, adminRoutes)).pipe(
  Layer.provide(PreviewPublicSupportLive),
  Layer.provide(server),
  Layer.launch,
  NodeRuntime.runMain,
)
