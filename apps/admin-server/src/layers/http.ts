// Platform boundary required by NodeHttpServer.layerConfig.
// @effect-diagnostics-next-line nodeBuiltinImport:off
// eslint-disable-next-line no-restricted-imports -- NodeHttpServer.layerConfig requires the Node server constructor at this composition root.
import { createServer } from "node:http"
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer"
import { AdminSessionAuthorizationLive } from "@proxus/backend-admin-transport/session"
import { Config, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { AdminApiRoutes } from "../http.js"
import { AdminDevLive } from "./admin.dev.js"
import { AdminProdLive } from "./admin.prod.js"

const NodeServerLive = NodeHttpServer.layerConfig(createServer, {
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.int("PORT").pipe(Config.withDefault(3001)),
})
const makeHttpLive = <A, E, R>(services: Layer.Layer<A, E, R>) => {
  const session = AdminSessionAuthorizationLive.pipe(Layer.provide(services))
  return HttpRouter.serve(AdminApiRoutes.pipe(Layer.provide(Layer.merge(services, session)))).pipe(Layer.provide(NodeServerLive))
}

export const HttpDevLive = makeHttpLive(AdminDevLive)
export const HttpProdLive = makeHttpLive(AdminProdLive)
