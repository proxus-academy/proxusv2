// Production-only composition must not import the PGlite development graph.
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createServer } from "node:http"
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer"
import { AdminSessionAuthorizationLive } from "@proxus/backend-admin-transport/session"
import { Config, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { AdminApiRoutes } from "../http.js"
import { AdminProdLive } from "./admin.prod.js"

const NodeServerLive = NodeHttpServer.layerConfig(createServer, {
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.int("PORT").pipe(Config.withDefault(3001)),
})
const session = AdminSessionAuthorizationLive.pipe(Layer.provide(AdminProdLive))

export const HttpProdLive = HttpRouter.serve(
  AdminApiRoutes.pipe(Layer.provide(Layer.merge(AdminProdLive, session))),
).pipe(Layer.provide(NodeServerLive))
