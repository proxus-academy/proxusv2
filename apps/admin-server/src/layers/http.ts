// Platform boundary required by NodeHttpServer.layerConfig.
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createServer } from "node:http"
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer"
import { Config, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { AdminApiRoutes } from "../http.js"
import { StudyCatalogDevLive } from "./study-catalog.dev.js"
import { StudyCatalogProdLive } from "./study-catalog.prod.js"

const NodeServerLive = NodeHttpServer.layerConfig(createServer, {
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.int("PORT").pipe(Config.withDefault(3001)),
})
const makeHttpLive = <A, E, R>(catalog: Layer.Layer<A, E, R>) =>
  HttpRouter.serve(AdminApiRoutes.pipe(Layer.provide(catalog))).pipe(Layer.provide(NodeServerLive))

export const HttpDevLive = makeHttpLive(StudyCatalogDevLive)
export const HttpProdLive = makeHttpLive(StudyCatalogProdLive)
