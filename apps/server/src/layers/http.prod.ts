// Production-only composition must not import the PGlite development graph.
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createServer } from "node:http"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer"
import * as NodePath from "@effect/platform-node/NodePath"
import { AccessControlServiceLive, makeMemoryRoleAssignmentsRepository } from "@proxus/backend-domain/access-control"
import { StudyPathValidator } from "@proxus/backend-domain/auth"
import { Config, Effect, Layer, Redacted } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { layer as localObjectStorageLayer, LocalObjectStorageTransfers } from "../infrastructure/object-storage/object-storage.local.js"
import { httpLayer as localObjectStorageHttpLayer } from "../infrastructure/object-storage/object-storage.local.http.js"
import { ObjectStorage } from "../infrastructure/object-storage/object-storage.js"
import { makePublicApiRoutes } from "../http.js"
import { AuthProdLive } from "./auth.prod.js"
import { FeatureFlagsProdLive } from "./feature-flags.prod.js"
import { ProductAnalyticsProdLive } from "./product-analytics.prod.js"
import { StudyCatalogProdLive } from "./study-catalog.prod.js"

const NodeServerLive = NodeHttpServer.layerConfig(createServer, {
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.int("PORT").pipe(Config.withDefault(3000)),
})
const ObjectStorageLive = Layer.unwrap(Effect.all({
  root: Config.string("OBJECT_STORAGE_LOCAL_ROOT").pipe(Config.withDefault(".data/object-storage")),
  secret: Config.redacted("OBJECT_STORAGE_SIGNING_SECRET"),
}).pipe(Effect.map(({ root, secret }) => localObjectStorageLayer({
  root,
  publicBaseUrl: "/api",
  signingSecret: Redacted.value(secret),
})))).pipe(Layer.provide([NodeFileSystem.layer, NodePath.layer]))
const AccessLive = AccessControlServiceLive.pipe(Layer.provide(makeMemoryRoleAssignmentsRepository([])))
const CatalogLive = StudyCatalogProdLive.pipe(Layer.provide(AccessLive))
const CatalogSupport = StudyPathValidator.layer.pipe(Layer.provide(CatalogLive))
const ApplicationLive = Layer.mergeAll(CatalogLive, ProductAnalyticsProdLive, FeatureFlagsProdLive)

const AuthAndCatalogSupport = Layer.merge(AuthProdLive, CatalogSupport)
const routes = Layer.merge(
  makePublicApiRoutes(AuthAndCatalogSupport).pipe(Layer.provide(AuthAndCatalogSupport)),
  localObjectStorageHttpLayer(),
).pipe(
  Layer.provide(ApplicationLive),
  Layer.provide(ObjectStorageLive),
  Layer.provideMerge(AuthAndCatalogSupport),
)

export const HttpProdLive = HttpRouter.serve(routes).pipe(
  Layer.provide(AuthAndCatalogSupport),
  Layer.provide(NodeServerLive),
)
