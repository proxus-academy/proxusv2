// Platform boundary required by NodeHttpServer.layerConfig.
// @effect-diagnostics-next-line nodeBuiltinImport:off
// eslint-disable-next-line no-restricted-imports -- NodeHttpServer.layerConfig requires the Node server constructor at this composition root.
import { createServer } from "node:http"
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import { Config, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { DevelopmentApiRoutes } from "./http.js"
import { DevelopmentPublicSupportLive } from "./services.js"

const server = NodeHttpServer.layerConfig(createServer, {
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.int("PORT").pipe(Config.withDefault(3000)),
})

HttpRouter.serve(DevelopmentApiRoutes).pipe(
  Layer.provide(DevelopmentPublicSupportLive),
  Layer.provide(server),
  Layer.launch,
  NodeRuntime.runMain,
)
