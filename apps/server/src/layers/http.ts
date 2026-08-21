// Platform boundary required by NodeHttpServer.layerConfig.
// @effect-diagnostics-next-line nodeBuiltinImport:off
// eslint-disable-next-line no-restricted-imports -- NodeHttpServer.layerConfig requires the Node server constructor at this composition root.
import { createServer } from "node:http"
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import { AccessControlServiceLive, makeMemoryRoleAssignmentsRepository } from "@proxus/backend-domain/access-control"
import { ApplicationRealtimeLive } from "@proxus/backend-domain/realtime"
import { AuthenticationService, GoogleFlow, RegistrationService, StudyPathValidator } from "@proxus/backend-domain/auth"
import { AuthSessionCookies, AuthSessionView } from "@proxus/backend-transport/auth"
import { Config, Effect, Layer, Redacted } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { makePublicApiRoutes } from "../http.js"
import { FeatureFlagsDevLive } from "./feature-flags.dev.js"
import { FeatureFlagsProdLive } from "./feature-flags.prod.js"
import { ProductAnalyticsDevLive } from "./product-analytics.dev.js"
import { ProductAnalyticsProdLive } from "./product-analytics.prod.js"
import { StudyCatalogDevLive } from "./study-catalog.dev.js"
import { StudyCatalogProdLive } from "./study-catalog.prod.js"
import { AuthDevLive, AuthProdLive } from "./auth.js"
import { ConversationsDevLive } from "./conversations.dev.js"
import { ConversationsProdLive } from "./conversations.prod.js"
import { layer as localObjectStorageLayer } from "../infrastructure/object-storage/object-storage.local.js"
import { LocalObjectStorageTransfers } from "../infrastructure/object-storage/object-storage.local.js"
import { ObjectStorage } from "../infrastructure/object-storage/object-storage.js"
import { httpLayer as localObjectStorageHttpLayer } from "../infrastructure/object-storage/object-storage.local.http.js"

const NodeServerLive = NodeHttpServer.layerConfig(createServer, {
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.int("PORT").pipe(Config.withDefault(3000)),
})

const makeHttpLive = <A, E, R, E2, R2, E3, E4>(
  application: Layer.Layer<A, E, R>,
  auth: Layer.Layer<RegistrationService | AuthenticationService | GoogleFlow | AuthSessionCookies | AuthSessionView, E2, R2>,
  studyPath: Layer.Layer<StudyPathValidator, E3>,
  objectStorage: Layer.Layer<ObjectStorage | LocalObjectStorageTransfers, E4>,
) => HttpRouter.serve(Layer.merge(
  makePublicApiRoutes(Layer.merge(auth, studyPath)),
  localObjectStorageHttpLayer(),
).pipe(
  Layer.provide(application),
  Layer.provide(objectStorage),
)).pipe(Layer.provide(NodeServerLive))

const makeLocalObjectStorageLive = (signingSecret: Config.Config<Redacted.Redacted>) =>
  Layer.unwrap(signingSecret.pipe(Effect.map((secret) => localObjectStorageLayer({
    root: ".data/object-storage",
    publicBaseUrl: "/api",
    signingSecret: Redacted.value(secret),
  })))).pipe(Layer.provide([NodeFileSystem.layer, NodePath.layer]))

const DevObjectStorageLive = makeLocalObjectStorageLive(
  Config.redacted("OBJECT_STORAGE_SIGNING_SECRET").pipe(
    Config.withDefault(Redacted.make("proxus-development-object-storage-secret")),
  ),
)
const ProdObjectStorageLive = makeLocalObjectStorageLive(Config.redacted("OBJECT_STORAGE_SIGNING_SECRET"))

const AccessLive = AccessControlServiceLive.pipe(Layer.provide(makeMemoryRoleAssignmentsRepository([])))
const DevCatalogLive = StudyCatalogDevLive.pipe(Layer.provide(AccessLive))
const ProdCatalogLive = StudyCatalogProdLive.pipe(Layer.provide(AccessLive))
const devCatalogSupport = StudyPathValidator.layer.pipe(Layer.provide(DevCatalogLive))
const prodCatalogSupport = StudyPathValidator.layer.pipe(Layer.provide(ProdCatalogLive))

export const HttpDevLive = makeHttpLive(Layer.mergeAll(
  DevCatalogLive,
  ProductAnalyticsDevLive,
  FeatureFlagsDevLive,
  ApplicationRealtimeLive,
  ConversationsDevLive,
), AuthDevLive, devCatalogSupport, DevObjectStorageLive).pipe(Layer.provide(AuthDevLive), Layer.provide(devCatalogSupport))
export const HttpProdLive = makeHttpLive(Layer.mergeAll(
  ProdCatalogLive,
  ProductAnalyticsProdLive,
  FeatureFlagsProdLive,
  ApplicationRealtimeLive,
  ConversationsProdLive,
), AuthProdLive, prodCatalogSupport, ProdObjectStorageLive).pipe(Layer.provide(AuthProdLive), Layer.provide(prodCatalogSupport))
