import { UgcManagementService, type UgcServiceError } from "@proxus/backend-domain/ugc-management"
import { type AccountId, CurrentUser } from "@proxus/shared/auth"
import { PublicApi } from "@proxus/shared/public-api"
import { UgcConflict } from "@proxus/shared/ugc-management"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"

const run = <A, R>(operation: (accountId: AccountId) => Effect.Effect<A, UgcServiceError, R>) =>
  Effect.flatMap(CurrentUser, (current) => operation(current.account.id)).pipe(
    Effect.catchTag("UgcOptimisticConflict", ({ entity }) => Effect.fail(new UgcConflict({ message: `${entity} changed while the action was being applied` }))),
    Effect.catchTag("UgcRepositoryError", () => Effect.fail(new HttpApiError.InternalServerError({}))),
  )

export const PublicUgcHandlers = HttpApiBuilder.group(
  PublicApi,
  "publicUgc",
  Effect.fn(function* (handlers) {
    const service = yield* UgcManagementService
    return handlers
      .handle("workspace", () => run((accountId) => service.workspace(accountId)))
      .handle("command", ({ payload }) => run((accountId) => service.execute(accountId, payload.command)))
  }),
)
