import { ConversationsLive } from "@proxus/backend-domain/conversations"
import { ConversationGenerationOpenAiLive } from "@proxus/backend-infra/conversations/openai"
import { ConversationsRepositoryPostgresLive } from "@proxus/backend-infra/conversations/postgres"
import { PostgresMigrationCheckLive, makePostgresProductionLive } from "@proxus/backend-infra/database/postgres"
import { Layer } from "effect"

const DatabaseLive = makePostgresProductionLive("proxus-server")
const PersistenceLive = Layer.merge(PostgresMigrationCheckLive, ConversationsRepositoryPostgresLive).pipe(
  Layer.provide(DatabaseLive),
)

export const ConversationsProdLive = ConversationsLive.pipe(
  Layer.provide(PersistenceLive),
  Layer.provide(ConversationGenerationOpenAiLive),
)
