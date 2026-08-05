import { AdminUsersService, type AdminUsersError } from "@proxus/backend-domain/auth"
import { Forbidden as HttpForbidden } from "@proxus/shared/access-control"
import { AdminApi } from "@proxus/shared/admin-api"
import { CurrentUser } from "@proxus/shared/auth"
import { DateTime, Effect } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"

const internal = () => Effect.fail(new HttpApiError.InternalServerError({}))

export const AdminUsersHandlers = HttpApiBuilder.group(
  AdminApi,
  "adminUsers",
  Effect.fn(function*(handlers) {
    const service = yield* AdminUsersService
    const run = <A, R>(operation: (actor: { readonly type: "user"; readonly id: string }) => Effect.Effect<A, AdminUsersError, R>) =>
      Effect.flatMap(CurrentUser, (current) => operation({ type: "user", id: current.account.id })).pipe(
        Effect.catchTag("Forbidden", () => Effect.fail(new HttpForbidden({ message: "Administrator role required" }))),
        Effect.catchTags({
          RoleStoreError: internal,
          AuthRepositoryError: internal,
          UserNotFound: internal,
          InvalidRepositoryState: internal,
        }),
      )

    return handlers
      .handle("listUsers", () => run((actor) => service.list(actor)))
      .handle("updateStatus", ({ params, payload }) => DateTime.now.pipe(
        Effect.flatMap((now) => run((actor) => service.updateStatus(actor, params.userId, payload.status, DateTime.toDateUtc(now)))),
      ))
  }),
)
