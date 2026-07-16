import { StudyCatalogLive } from "@proxus/backend-domain/study-catalog"
import { PgliteLive, PgliteMigrationLive } from "@proxus/backend-infra/database/pglite"
import { StudyCatalogRepositoryPgliteLive } from "@proxus/backend-infra/study-catalog/pglite"
import { PublicApi } from "@proxus/shared/public-api"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"
import { PublicApiRoutes } from "../../http.js"

const EmbeddedPersistenceLive = Layer.merge(
  PgliteMigrationLive,
  StudyCatalogRepositoryPgliteLive,
).pipe(Layer.provide(PgliteLive()))

const EmbeddedRoutesLive = PublicApiRoutes.pipe(
  Layer.provide(StudyCatalogLive.pipe(Layer.provide(EmbeddedPersistenceLive))),
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
