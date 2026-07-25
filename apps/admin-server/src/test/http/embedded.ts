import { AdminSessionAuthorizationLive } from "@proxus/backend-admin-transport/session"
import { AuthenticationService } from "@proxus/backend-domain/auth"
import { PasswordsLive } from "@proxus/backend-infra/auth"
import { seedAuthQa } from "@proxus/backend-infra/auth-qa"
import { PgliteLive, seedPgliteStudyCatalog } from "@proxus/backend-infra/database/pglite"
import { AdminApi } from "@proxus/shared/admin-api"
import { Effect, Layer } from "effect"
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"
import { AdminApiRoutes } from "../../http.js"
import { AdminDevLive, makeAdminDevLive } from "../../layers/admin.dev.js"

const ServicesLive = Layer.merge(AdminDevLive, AdminSessionAuthorizationLive.pipe(Layer.provide(AdminDevLive)))
const RoutesLive = AdminApiRoutes.pipe(
  Layer.provide(ServicesLive),
  Layer.provide(HttpServer.layerServices),
)
export const makeEmbeddedAdminWeb = Effect.acquireRelease(
  Effect.sync(() => HttpRouter.toWebHandler(RoutesLive, { disableLogger: true })),
  (web) => Effect.promise(() => web.dispose()),
)
const qaPassword = "Proxus-QA-dev-2026!"

/** Seeds production-shaped users and issues real opaque sessions through one isolated PGlite context. */
export const makeEmbeddedAdminAuthorizationMatrix = Effect.gen(function*() {
  const database = PgliteLive()
  const admin = makeAdminDevLive(database)
  const services = Layer.mergeAll(database, admin, AdminSessionAuthorizationLive.pipe(Layer.provide(admin)))
  const context = yield* Layer.build(Layer.merge(services, PasswordsLive))
  const credentials = yield* Effect.gen(function*() {
    yield* seedPgliteStudyCatalog
    yield* seedAuthQa()
    const authentication = yield* AuthenticationService
    const login = (email: string) => authentication.loginWithPassword({ email, password: qaPassword }).pipe(
      Effect.map(({ token }) => ({ cookie: `proxus_session=${token}` })),
    )
    return {
      student: yield* login("student.email.qa@proxus.dev"),
      editor: yield* login("editor.qa@proxus.dev"),
      admin: yield* login("admin.qa@proxus.dev"),
    }
  }).pipe(Effect.provide(context))
  const routes = AdminApiRoutes.pipe(
    Layer.provide(Layer.succeedContext(context)),
    Layer.provide(HttpServer.layerServices),
  )
  const web = yield* Effect.acquireRelease(
    Effect.sync(() => HttpRouter.toWebHandler(routes, { disableLogger: true })),
    (handler) => Effect.promise(() => handler.dispose()),
  )
  return { web, credentials } as const
})

const makeEmbeddedAdminClient = Effect.gen(function*() {
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
