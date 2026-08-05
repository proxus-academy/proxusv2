import { makeAdminApiRoutes } from "@proxus/backend-admin-transport"
import { makePublicApiRoutes } from "@proxus/backend-transport"
import { Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { withRequestBodyLimit } from "./http-body-limit.js"
import { DevelopmentPublicSupportLive, DevelopmentServicesLive } from "./services.js"

const publicRoutes = makePublicApiRoutes("/openapi.public.json").pipe(Layer.provide(
  Layer.merge(DevelopmentServicesLive, DevelopmentPublicSupportLive),
))
const adminRoutes = makeAdminApiRoutes("/openapi.admin.json").pipe(Layer.provide(DevelopmentServicesLive))
const routes = Layer.merge(publicRoutes, adminRoutes)
const bodyLimit = HttpRouter.middleware(withRequestBodyLimit, { global: true })

export const DevelopmentApiRoutes = Layer.merge(routes, bodyLimit)
