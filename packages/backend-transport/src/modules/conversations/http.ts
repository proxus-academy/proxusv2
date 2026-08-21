import { Conversations, ConversationsRepositoryError } from "@proxus/backend-domain/conversations"
import { CurrentUser } from "@proxus/shared/auth"
import { PublicApi } from "@proxus/shared/public-api"
import { Effect, Schema } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"

const internal = () => new HttpApiError.InternalServerError({})
const mapInternal = <A, E, R>(effect: Effect.Effect<A, E | ConversationsRepositoryError, R>) => effect.pipe(
  Effect.catchTag("ConversationsRepositoryError", () => Effect.fail(internal())),
)

export const PublicConversationsHandlers = HttpApiBuilder.group(PublicApi, "conversations", Effect.fn(function* (handlers) {
  const conversations = yield* Conversations
  const ownerId = CurrentUser.pipe(Effect.map((current) => current.account.id))

  return handlers
    .handle("listThreads", () => ownerId.pipe(Effect.flatMap(conversations.listThreads), Effect.mapError(() => internal())))
    .handle("createThread", ({ payload }) => ownerId.pipe(Effect.flatMap((owner) => conversations.createThread(owner, payload.title)), Effect.mapError(() => internal())))
    .handle("getThread", ({ params }) => ownerId.pipe(Effect.flatMap((owner) => conversations.getThread(owner, params.threadId)), mapInternal))
    .handle("renameThread", ({ params, payload }) => ownerId.pipe(Effect.flatMap((owner) => conversations.renameThread(owner, params.threadId, payload.title)), mapInternal))
    .handle("deleteThread", ({ params }) => ownerId.pipe(Effect.flatMap((owner) => conversations.deleteThread(owner, params.threadId)), mapInternal))
    .handle("listMessages", ({ params }) => ownerId.pipe(Effect.flatMap((owner) => conversations.listMessages(owner, params.threadId)), mapInternal))
    .handle("startRun", ({ params, payload }) => ownerId.pipe(Effect.flatMap((owner) => conversations.startRun(owner, params.threadId, payload.message)), mapInternal))
    .handle("getRun", ({ params }) => ownerId.pipe(
      Effect.flatMap((owner) => conversations.getRun(owner, params.runId)),
      Effect.mapError(() => internal()),
    ))
    .handle("interruptRun", ({ params }) => ownerId.pipe(
      Effect.flatMap((owner) => conversations.interruptRun(owner, params.runId)),
      Effect.mapError(() => internal()),
    ))
}))
