import { ConversationGenerationDeterministic, ConversationsLive } from "@proxus/backend-domain/conversations"
import { ConversationsRepositoryPgliteLive } from "@proxus/backend-infra/conversations/pglite"
import { PgliteDevelopmentLive, PgliteMigrationLive } from "@proxus/backend-infra/database/pglite"
import { Layer } from "effect"

const PersistenceLive = Layer.merge(PgliteMigrationLive, ConversationsRepositoryPgliteLive).pipe(
  Layer.provide(PgliteDevelopmentLive),
)

export const ConversationsDevLive = ConversationsLive.pipe(
  Layer.provide(PersistenceLive),
  Layer.provide(ConversationGenerationDeterministic),
)
