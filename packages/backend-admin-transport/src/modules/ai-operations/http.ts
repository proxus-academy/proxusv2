import { AiOperations } from "@proxus/backend-domain/conversations"
import { Forbidden as HttpForbidden } from "@proxus/shared/access-control"
import { AdminApi } from "@proxus/shared/admin-api"
import { CurrentUser } from "@proxus/shared/auth"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"

export const AdminAiOperationsHandlers = HttpApiBuilder.group(AdminApi, "aiOperations", Effect.fn(function*(handlers) {
  const operations = yield* AiOperations
  return handlers.handle("listOperations", () => CurrentUser.pipe(
    Effect.flatMap((current) => operations.list({ type: "user", id: current.account.id })),
    Effect.catchTag("Forbidden", (error) => Effect.fail(new HttpForbidden({ message: error.message }))),
    Effect.catchTags({
      RoleStoreError: () => Effect.fail(new HttpApiError.InternalServerError({})),
      ConversationsRepositoryError: () => Effect.fail(new HttpApiError.InternalServerError({})),
    }),
  ))
}))
