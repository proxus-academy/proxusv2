import { Context } from "effect"
import { HttpApiMiddleware, HttpApiSecurity } from "effect/unstable/httpapi"
import { CurrentSession } from "./model.js"
import { Unauthorized } from "./errors.js"

export const authSessionCookieName = "proxus_session"

export class CurrentUser extends Context.Service<CurrentUser, CurrentSession>()(
  "@proxus/shared/modules/auth/middleware/CurrentUser",
) {}

export class SessionAuthorization extends HttpApiMiddleware.Service<
  SessionAuthorization,
  { provides: CurrentUser; requires: never }
>()("@proxus/shared/modules/auth/middleware/SessionAuthorization", {
  requiredForClient: false,
  security: {
    session: HttpApiSecurity.apiKey({ key: authSessionCookieName, in: "cookie" }),
  },
  error: Unauthorized,
}) {}
