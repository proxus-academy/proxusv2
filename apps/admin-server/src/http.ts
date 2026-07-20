import { AdminApiRoutes as TransportAdminApiRoutes } from "@proxus/backend-admin-transport"
import { Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { withRequestBodyLimit } from "./http-body-limit.js"

const RequestBodyLimitLive = HttpRouter.middleware(
  withRequestBodyLimit,
  { global: true },
)

export const AdminApiRoutes = Layer.merge(
  TransportAdminApiRoutes,
  RequestBodyLimitLive,
)
