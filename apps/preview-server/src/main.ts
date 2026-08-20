// Platform seam required by NodeHttpServer.layerConfig.
// @effect-diagnostics-next-line nodeBuiltinImport:off
// eslint-disable-next-line no-restricted-imports -- NodeHttpServer.layerConfig requires the Node server constructor at this composition root.
import { createServer } from "node:http"
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import { makeAdminApiRoutes } from "@proxus/backend-admin-transport"
import { makePublicApiRoutes } from "@proxus/backend-transport"
import { Config, Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse, HttpStaticServer } from "effect/unstable/http"
import { PreviewPublicSupportLive, PreviewServicesLive } from "./services.js"

const prefixed = <A, E, R>(prefix: string, routes: Layer.Layer<A, E, R>) => Layer.unwrap(
  HttpRouter.HttpRouter.pipe(Effect.map((router) => routes.pipe(
    Layer.provide(Layer.succeed(HttpRouter.HttpRouter, router.prefixed(prefix))),
  ))),
)

const publicRoutes = prefixed("/api", makePublicApiRoutes("/openapi.public.json").pipe(Layer.provide(
  Layer.merge(PreviewServicesLive, PreviewPublicSupportLive),
)))
const adminRoutes = prefixed(
  "/admin-api",
  makeAdminApiRoutes("/openapi.admin.json").pipe(Layer.provide(PreviewServicesLive)),
)
const healthRoute = HttpRouter.add("GET", "/healthz", HttpServerResponse.empty({ status: 204 }))
const staticAssets = Layer.unwrap(Effect.gen(function*() {
  const adminRoot = yield* Config.string("ADMIN_ROOT").pipe(Config.withDefault("/app/admin"))
  const webRoot = yield* Config.string("WEB_ROOT").pipe(Config.withDefault("/app/web"))
  return Layer.merge(
    HttpStaticServer.layer({
      root: adminRoot,
      prefix: "/admin",
      index: "index.html",
      spa: true,
    }),
    HttpStaticServer.layer({
      root: webRoot,
      index: "index.html",
      spa: true,
    }),
  )
}))
const routes = Layer.mergeAll(publicRoutes, adminRoutes, healthRoute, staticAssets)
const server = NodeHttpServer.layerConfig(createServer, {
  host: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  port: Config.int("PORT").pipe(Config.withDefault(8080)),
})

HttpRouter.serve(routes).pipe(
  Layer.provide(PreviewPublicSupportLive),
  Layer.provide(server),
  Layer.launch,
  NodeRuntime.runMain,
)
