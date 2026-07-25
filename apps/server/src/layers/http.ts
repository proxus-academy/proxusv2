// Platform boundary required by NodeHttpServer.layerConfig.
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createServer } from "node:http"
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer"
import { AccessControlServiceLive, makeMemoryRoleAssignmentsRepository } from "@proxus/backend-domain/access-control"
import { AuthenticationService, GoogleFlow, RegistrationService, StudyPathValidator } from "@proxus/backend-domain/auth"
import { AuthSessionCookies, AuthSessionView } from "@proxus/backend-transport/auth"
import { Config, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { makePublicApiRoutes } from "../http.js"
import { FeatureFlagsDevLive } from "./feature-flags.dev.js"
import { FeatureFlagsProdLive } from "./feature-flags.prod.js"
import { ProductAnalyticsDevLive } from "./product-analytics.dev.js"
import { ProductAnalyticsProdLive } from "./product-analytics.prod.js"
import { StudyCatalogDevLive } from "./study-catalog.dev.js"
import { StudyCatalogProdLive } from "./study-catalog.prod.js"
import { AuthDevLive, AuthProdLive } from "./auth.js"

const NodeServerLive = NodeHttpServer.layerConfig(createServer, {
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.int("PORT").pipe(Config.withDefault(3000)),
})

const makeHttpLive = <A, E, R, E2, R2, E3>(
  application: Layer.Layer<A, E, R>,
  auth: Layer.Layer<RegistrationService | AuthenticationService | GoogleFlow | AuthSessionCookies | AuthSessionView, E2, R2>,
  studyPath: Layer.Layer<StudyPathValidator, E3>,
) => HttpRouter.serve(makePublicApiRoutes(Layer.merge(auth, studyPath)).pipe(
  Layer.provide(application),
)).pipe(Layer.provide(NodeServerLive))

const AccessLive = AccessControlServiceLive.pipe(Layer.provide(makeMemoryRoleAssignmentsRepository([])))
const DevCatalogLive = StudyCatalogDevLive.pipe(Layer.provide(AccessLive))
const ProdCatalogLive = StudyCatalogProdLive.pipe(Layer.provide(AccessLive))
const devCatalogSupport = StudyPathValidator.layer.pipe(Layer.provide(DevCatalogLive))
const prodCatalogSupport = StudyPathValidator.layer.pipe(Layer.provide(ProdCatalogLive))

export const HttpDevLive = makeHttpLive(Layer.mergeAll(
  DevCatalogLive,
  ProductAnalyticsDevLive,
  FeatureFlagsDevLive,
), AuthDevLive, devCatalogSupport).pipe(Layer.provide(AuthDevLive), Layer.provide(devCatalogSupport))
export const HttpProdLive = makeHttpLive(Layer.mergeAll(
  ProdCatalogLive,
  ProductAnalyticsProdLive,
  FeatureFlagsProdLive,
), AuthProdLive, prodCatalogSupport).pipe(Layer.provide(AuthProdLive), Layer.provide(prodCatalogSupport))
