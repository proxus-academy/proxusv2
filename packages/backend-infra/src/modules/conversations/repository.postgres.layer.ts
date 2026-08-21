import { ConversationsRepository } from "@proxus/backend-domain/conversations"
import * as PostgresDrizzle from "drizzle-orm/effect-postgres"
import { Effect, Layer } from "effect"
import { makeConversationsRepositoryDrizzle } from "./repository.drizzle.js"

export const ConversationsRepositoryPostgresLive = Layer.effect(
  ConversationsRepository,
  PostgresDrizzle.makeWithDefaults().pipe(Effect.map(makeConversationsRepositoryDrizzle)),
)
