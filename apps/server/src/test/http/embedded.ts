import { FeatureFlagSnapshotReaderLive } from "@proxus/backend-domain/feature-flags"
import { ProductAnalyticsLive } from "@proxus/backend-domain/product-analytics"
import { AccessControlServiceLive, makeMemoryRoleAssignmentsRepository } from "@proxus/backend-domain/access-control"
import { StudyPathValidator } from "@proxus/backend-domain/auth"
import { StudyCatalogLive } from "@proxus/backend-domain/study-catalog"
import { ApplicationRealtimeLive } from "@proxus/backend-domain/realtime"
import { PgliteLive, PgliteMigrationLive } from "@proxus/backend-infra/database/pglite"
import { FeatureFlagSnapshotRepositoryPgliteLive } from "@proxus/backend-infra/feature-flags/pglite"
import { makeAuthPersistencePgliteLive } from "@proxus/backend-infra/auth"
import { ProductAnalyticsRepositoryMemory } from "@proxus/backend-infra/product-analytics/memory"
import { StudyCatalogRepositoryPgliteLive } from "@proxus/backend-infra/study-catalog/pglite"
import { ProductAnalyticsHttpContextFailClosed } from "@proxus/backend-transport/product-analytics"
import { PublicApi } from "@proxus/shared/public-api"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"
import { makePublicApiRoutes } from "../../http.js"
import { makeAuthDevLive } from "../../layers/auth.js"

const EmbeddedDatabaseLive = PgliteLive()
const EmbeddedPersistenceLive = Layer.mergeAll(
  PgliteMigrationLive,
  StudyCatalogRepositoryPgliteLive,
  FeatureFlagSnapshotRepositoryPgliteLive,
).pipe(Layer.provide(EmbeddedDatabaseLive))

const EmbeddedFeatureFlagsLive = FeatureFlagSnapshotReaderLive.pipe(Layer.provide(EmbeddedPersistenceLive))

const AccessLive = AccessControlServiceLive.pipe(Layer.provide(makeMemoryRoleAssignmentsRepository([])))
const EmbeddedStudyCatalogLive = StudyCatalogLive.pipe(Layer.provide(EmbeddedPersistenceLive), Layer.provide(AccessLive))
const EmbeddedAuthPersistenceLive = makeAuthPersistencePgliteLive(30 * 86_400_000).pipe(Layer.provide(EmbeddedDatabaseLive))
const EmbeddedAuthLive = makeAuthDevLive(undefined, undefined, EmbeddedAuthPersistenceLive)
const EmbeddedStudyPathLive = StudyPathValidator.layer.pipe(Layer.provide(EmbeddedStudyCatalogLive))
const EmbeddedRoutesLive = makePublicApiRoutes(Layer.merge(EmbeddedAuthLive, EmbeddedStudyPathLive)).pipe(
  Layer.provide(Layer.mergeAll(
    EmbeddedStudyCatalogLive,
    EmbeddedFeatureFlagsLive,
    ProductAnalyticsLive.pipe(Layer.provide(ProductAnalyticsRepositoryMemory)),
    ProductAnalyticsHttpContextFailClosed,
    ApplicationRealtimeLive,
  )),
  Layer.provide(HttpServer.layerServices),
  Layer.provide(EmbeddedAuthLive),
  Layer.provide(EmbeddedStudyPathLive),
)

export const makeEmbeddedPublicWeb = Effect.gen(function*() {
  const context = yield* Layer.build(Layer.merge(EmbeddedAuthLive, EmbeddedStudyPathLive))
  const web = yield* Effect.acquireRelease(
    Effect.sync(() => HttpRouter.toWebHandler(EmbeddedRoutesLive, { disableLogger: true })),
    (value) => Effect.promise(() => value.dispose()),
  )
  return {
    handler: (request: Request) => web.handler(request, context),
    dispose: web.dispose,
  }
})

export const makeEmbeddedPublicClient = Effect.gen(function*() {
  const web = yield* makeEmbeddedPublicWeb
  const fetch = Object.assign(
    (input: Parameters<typeof globalThis.fetch>[0], init?: Parameters<typeof globalThis.fetch>[1]) =>
      web.handler(new Request(input, init)),
    { preconnect: () => undefined },
  ) satisfies typeof globalThis.fetch
  const clientContext = yield* Layer.build(FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
  ))
  return yield* HttpApiClient.make(PublicApi, { baseUrl: "http://proxus.test" }).pipe(
    Effect.provide(clientContext),
  )
})
