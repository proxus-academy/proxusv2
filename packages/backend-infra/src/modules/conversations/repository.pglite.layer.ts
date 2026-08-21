import { ConversationsRepository } from "@proxus/backend-domain/conversations"
import * as PgliteDrizzle from "drizzle-orm/effect-pglite"
import { Effect, Layer } from "effect"
import { makeConversationsRepositoryDrizzle } from "./repository.drizzle.js"

export const ConversationsRepositoryPgliteLive = Layer.effect(
  ConversationsRepository,
  PgliteDrizzle.makeWithDefaults().pipe(Effect.map(makeConversationsRepositoryDrizzle)),
)
