import { AccessControlService, type Forbidden, type RoleStoreError, type Subject } from "@proxus/backend-domain/access-control"
import type { AiOperation } from "@proxus/shared/ai-operations"
import { Context, Effect, Layer } from "effect"
import { ConversationsRepository, type ConversationsRepositoryError } from "./repository.js"

export class AiOperations extends Context.Service<AiOperations, {
  readonly list: (actor: Subject) => Effect.Effect<ReadonlyArray<AiOperation>, Forbidden | RoleStoreError | ConversationsRepositoryError>
}>()("@proxus/backend-domain/modules/conversations/operations/AiOperations") {}

export const AiOperationsLive = Layer.effect(AiOperations, Effect.gen(function*() {
  const access = yield* AccessControlService
  const repository = yield* ConversationsRepository
  return AiOperations.of({ list: (actor) => access.requireAdministrator(actor).pipe(Effect.andThen(repository.listOperations())) })
}))
