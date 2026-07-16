// Platform boundary required by NodeHttpServer.layerConfig.
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createServer } from "node:http"
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer"
import { Config, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { PublicApiRoutes } from "../http.js"
import { FeatureFlagsDevLive } from "./feature-flags.dev.js"
import { FeatureFlagsProdLive } from "./feature-flags.prod.js"
import { ProductAnalyticsDevLive } from "./product-analytics.dev.js"
import { ProductAnalyticsProdLive } from "./product-analytics.prod.js"
import { StudyCatalogDevLive } from "./study-catalog.dev.js"
import { StudyCatalogProdLive } from "./study-catalog.prod.js"

const NodeServerLive = NodeHttpServer.layerConfig(createServer, {
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.int("PORT").pipe(Config.withDefault(3000)),
})

const makeHttpLive = <A, E, R>(application: Layer.Layer<A, E, R>) =>
  HttpRouter.serve(PublicApiRoutes.pipe(Layer.provide(application))).pipe(
    Layer.provide(NodeServerLive),
  )

export const HttpDevLive = makeHttpLive(Layer.mergeAll(StudyCatalogDevLive, ProductAnalyticsDevLive, FeatureFlagsDevLive))
export const HttpProdLive = makeHttpLive(Layer.mergeAll(StudyCatalogProdLive, ProductAnalyticsProdLive, FeatureFlagsProdLive))
