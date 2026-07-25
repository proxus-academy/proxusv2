import { Access, AccessControlService } from "@proxus/backend-domain/access-control"
import { AdminApi } from "@proxus/shared/admin-api"
import { Capabilities, Forbidden as HttpForbidden } from "@proxus/shared/access-control"
import { CurrentUser } from "@proxus/shared/auth"
import { Clock, DateTime, Effect } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"

const forbidden = () => new HttpForbidden({ message: "Forbidden" })
const internal = () => new HttpApiError.InternalServerError({})
const mapError = (error: { readonly _tag: string }) =>
  error._tag === "Forbidden" ? forbidden() : internal()

export const AdminAccessControlHandlers = HttpApiBuilder.group(AdminApi, "adminAccessControl", Effect.fn(function* (handlers) {
  const access = yield* AccessControlService
  return handlers
    .handle("capabilities", () => Effect.gen(function* () {
      const current = yield* CurrentUser
      const permissions = yield* access.capabilities({ type: "user", id: current.account.id }).pipe(Effect.mapError(mapError))
      return new Capabilities({ permissions: [...permissions].sort() })
    }))
    .handle("grantRole", ({ payload }) => Effect.gen(function* () {
      const current = yield* CurrentUser
      yield* access.grantRole(
        { type: "user", id: current.account.id },
        { userId: payload.userId, role: payload.role, scope: Access.scope(payload.scopeType, payload.scopeId) },
        DateTime.toDateUtc(DateTime.makeUnsafe(yield* Clock.currentTimeMillis)),
      ).pipe(Effect.mapError(mapError))
    }))
    .handle("revokeRole", ({ payload }) => Effect.gen(function* () {
      const current = yield* CurrentUser
      yield* access.revokeRole(
        { type: "user", id: current.account.id },
        { userId: payload.userId, role: payload.role, scope: Access.scope(payload.scopeType, payload.scopeId) },
      ).pipe(Effect.mapError(mapError))
    }))
}))
