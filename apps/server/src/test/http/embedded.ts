import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"
import { ProxusApi } from "@proxus/shared/api"
import { Effect, Layer } from "effect"
import { PgliteLive, PgliteMigrationLive } from "../../infrastructure/database/pglite.js"
import { ProxusApiRoutes } from "../../http.js"
import { StudyCatalogRepositoryPgliteLive } from "../../modules/study-catalog/adapters/repository.pglite.layer.js"
import { StudyCatalogLive } from "../../modules/study-catalog/service.live.js"

const EmbeddedPersistenceLive = Layer.merge(
  PgliteMigrationLive,
  StudyCatalogRepositoryPgliteLive,
).pipe(Layer.provide(PgliteLive()))

const EmbeddedStudyCatalogLive = StudyCatalogLive.pipe(
  Layer.provide(EmbeddedPersistenceLive),
)

const EmbeddedRoutesLive = ProxusApiRoutes.pipe(
  Layer.provide(EmbeddedStudyCatalogLive),
  Layer.provide(HttpServer.layerServices),
)

export const makeEmbeddedProxusClient = Effect.gen(function*() {
  const web = yield* Effect.acquireRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(EmbeddedRoutesLive, {
        disableLogger: true,
      }),
    ),
    (web) => Effect.promise(() => web.dispose()),
  )

  const fetch = Object.assign(
    (
      input: Parameters<typeof globalThis.fetch>[0],
      init?: Parameters<typeof globalThis.fetch>[1],
    ) => web.handler(new Request(input, init)),
    { preconnect: () => undefined },
  ) satisfies typeof globalThis.fetch

  const clientContext = yield* Layer.build(
    FetchHttpClient.layer.pipe(
      Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
    ),
  )
  return yield* HttpApiClient.make(ProxusApi, {
    baseUrl: "http://proxus.test",
  }).pipe(Effect.provide(clientContext))
})
