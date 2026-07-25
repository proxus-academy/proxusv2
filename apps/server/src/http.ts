import { AuthenticationService, GoogleFlow, RegistrationService, StudyPathValidator } from "@proxus/backend-domain/auth"
import { PublicApiRoutes as TransportPublicApiRoutes } from "@proxus/backend-transport"
import { AuthSessionCookies, AuthSessionView } from "@proxus/backend-transport/auth"
import { Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { withRequestBodyLimit } from "./http-body-limit.js"

const RequestBodyLimitLive = HttpRouter.middleware(
  withRequestBodyLimit,
  { global: true },
)

export const makePublicApiRoutes = <E, R>(dependencies: Layer.Layer<
  RegistrationService | AuthenticationService | GoogleFlow | AuthSessionCookies | AuthSessionView | StudyPathValidator,
  E,
  R
>) => Layer.merge(
  TransportPublicApiRoutes.pipe(Layer.provide(dependencies)),
  RequestBodyLimitLive,
)

const PublicApiRoutes = Layer.merge(TransportPublicApiRoutes, RequestBodyLimitLive)
