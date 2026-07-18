// Platform boundary required by NodeHttpServer.layerConfig.
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createServer } from "node:http"
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer"
import { AppEventBusLive } from "@proxus/backend-domain/app-events"
import { BackendRealtimeReactionsLive, makeRealtimeEventsLive } from "@proxus/backend-transport/realtime"
import { Config, Effect, Layer } from "effect"
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

const RealtimeEventsConfiguredLive = Layer.unwrap(Effect.gen(function*() {
  const capacity = yield* Config.int("REALTIME_CAPACITY").pipe(Config.withDefault(32))
  const heartbeatIntervalMs = yield* Config.int("REALTIME_HEARTBEAT_INTERVAL_MS").pipe(Config.withDefault(15_000))
  return makeRealtimeEventsLive({ capacity, heartbeatIntervalMs })
}))
// Reuse these exact Layer values so the handler, reactions, and bus share one scoped broker.
const ReactionsLive = BackendRealtimeReactionsLive.pipe(Layer.provide(RealtimeEventsConfiguredLive))
const EventBusLive = AppEventBusLive.pipe(Layer.provide(ReactionsLive))
const EventSystemLive = Layer.mergeAll(RealtimeEventsConfiguredLive, ReactionsLive, EventBusLive)

const makeHttpLive = <A, E, R>(application: Layer.Layer<A, E, R>) =>
  HttpRouter.serve(PublicApiRoutes.pipe(Layer.provide(application))).pipe(Layer.provide(NodeServerLive))

export const HttpDevLive = makeHttpLive(Layer.mergeAll(
  StudyCatalogDevLive,
  ProductAnalyticsDevLive,
  FeatureFlagsDevLive,
  EventSystemLive,
))
export const HttpProdLive = makeHttpLive(Layer.mergeAll(
  StudyCatalogProdLive,
  ProductAnalyticsProdLive,
  FeatureFlagsProdLive,
  EventSystemLive,
))
