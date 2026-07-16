import { StudyCatalogLive } from "@proxus/backend-domain/study-catalog"
import { PgliteLive, PgliteMigrationLive } from "@proxus/backend-infra/database/pglite"
import { StudyCatalogRepositoryPgliteLive } from "@proxus/backend-infra/study-catalog/pglite"
import { AdminApi } from "@proxus/shared/admin-api"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"
import { AdminApiRoutes } from "../../http.js"

const PersistenceLive = Layer.merge(PgliteMigrationLive, StudyCatalogRepositoryPgliteLive).pipe(
  Layer.provide(PgliteLive()),
)
const RoutesLive = AdminApiRoutes.pipe(
  Layer.provide(StudyCatalogLive.pipe(Layer.provide(PersistenceLive))),
  Layer.provide(HttpServer.layerServices),
)
export const makeEmbeddedAdminWeb = Effect.acquireRelease(
  Effect.sync(() => HttpRouter.toWebHandler(RoutesLive, { disableLogger: true })),
  (web) => Effect.promise(() => web.dispose()),
)
export const makeEmbeddedAdminClient = Effect.gen(function*() {
  const web = yield* makeEmbeddedAdminWeb
  const fetch = Object.assign(
    (input: Parameters<typeof globalThis.fetch>[0], init?: Parameters<typeof globalThis.fetch>[1]) => web.handler(new Request(input, init)),
    { preconnect: () => undefined },
  ) satisfies typeof globalThis.fetch
  const context = yield* Layer.build(FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
  ))
  return yield* HttpApiClient.make(AdminApi, { baseUrl: "http://proxus.test" }).pipe(Effect.provide(context))
})
