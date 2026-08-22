import { AccessControlService } from "@proxus/backend-domain/access-control"
import { UgcManagementService, type UgcServiceError } from "@proxus/backend-domain/ugc-management"
import { Forbidden as HttpForbidden } from "@proxus/shared/access-control"
import { AdminApi } from "@proxus/shared/admin-api"
import { type AccountId, CurrentUser } from "@proxus/shared/auth"
import { UgcConflict } from "@proxus/shared/ugc-management"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"

const internal = () => Effect.fail(new HttpApiError.InternalServerError({}))

export const AdminUgcHandlers = HttpApiBuilder.group(
  AdminApi,
  "adminUgc",
  Effect.fn(function* (handlers) {
    const access = yield* AccessControlService
    const service = yield* UgcManagementService
    const run = <A, R>(operation: (accountId: AccountId) => Effect.Effect<A, UgcServiceError, R>) =>
      Effect.flatMap(CurrentUser, (current) => {
        const actor = { type: "user" as const, id: current.account.id }
        return access.requireAdministrator(actor).pipe(Effect.andThen(operation(current.account.id)))
      }).pipe(
        Effect.catchTag("Forbidden", () => Effect.fail(new HttpForbidden({ message: "Administrator role required" }))),
        Effect.catchTag("UgcOptimisticConflict", ({ entity }) => Effect.fail(new UgcConflict({ message: `${entity} changed while the action was being applied` }))),
        Effect.catchTags({ UgcRepositoryError: internal, RoleStoreError: internal }),
      )

    return handlers
      .handle("workspace", () => run((accountId) => service.workspace(accountId, true)))
      .handle("command", ({ payload }) => run((accountId) => service.execute(accountId, payload.command, true)))
  }),
)
