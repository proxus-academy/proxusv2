import { PublicApiRoutes as TransportPublicApiRoutes } from "@proxus/backend-transport"
import { Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { withRequestBodyLimit } from "./http-body-limit.js"

const RequestBodyLimitLive = HttpRouter.middleware(
  withRequestBodyLimit,
  { global: true },
)

export const PublicApiRoutes = Layer.merge(
  TransportPublicApiRoutes,
  RequestBodyLimitLive,
)
