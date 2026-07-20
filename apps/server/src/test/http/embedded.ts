import { FeatureFlagSnapshotReaderLive } from "@proxus/backend-domain/feature-flags"
import { ProductAnalyticsLive } from "@proxus/backend-domain/product-analytics"
import { StudyCatalogLive } from "@proxus/backend-domain/study-catalog"
import { PgliteLive, PgliteMigrationLive } from "@proxus/backend-infra/database/pglite"
import { FeatureFlagSnapshotRepositoryPgliteLive } from "@proxus/backend-infra/feature-flags/pglite"
import { ProductAnalyticsRepositoryMemory } from "@proxus/backend-infra/product-analytics/memory"
import { StudyCatalogRepositoryPgliteLive } from "@proxus/backend-infra/study-catalog/pglite"
import { ProductAnalyticsHttpContextFailClosed } from "@proxus/backend-transport/product-analytics"
import { PublicApi } from "@proxus/shared/public-api"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"
import { PublicApiRoutes } from "../../http.js"

const EmbeddedPersistenceLive = Layer.mergeAll(
  PgliteMigrationLive,
  StudyCatalogRepositoryPgliteLive,
  FeatureFlagSnapshotRepositoryPgliteLive,
).pipe(Layer.provide(PgliteLive()))

const EmbeddedFeatureFlagsLive = FeatureFlagSnapshotReaderLive.pipe(Layer.provide(EmbeddedPersistenceLive))

const EmbeddedRoutesLive = PublicApiRoutes.pipe(
  Layer.provide(Layer.mergeAll(
    StudyCatalogLive.pipe(Layer.provide(EmbeddedPersistenceLive)),
    EmbeddedFeatureFlagsLive,
    ProductAnalyticsLive.pipe(Layer.provide(ProductAnalyticsRepositoryMemory)),
    ProductAnalyticsHttpContextFailClosed,
  )),
  Layer.provide(HttpServer.layerServices),
)

export const makeEmbeddedPublicWeb = Effect.acquireRelease(
  Effect.sync(() => HttpRouter.toWebHandler(EmbeddedRoutesLive, { disableLogger: true })),
  (web) => Effect.promise(() => web.dispose()),
)

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
