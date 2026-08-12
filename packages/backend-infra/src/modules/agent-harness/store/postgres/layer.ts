import { Layer } from "effect"
import { AgentStoreSqlLive, AgentTraceStoreSqlLive } from "../shared/layer.js"

/** PostgreSQL store implementation. Provide a PgClient Layer at the composition root. */
export const PostgresAgentStoreLive = AgentStoreSqlLive
export const PostgresAgentStoresLive = Layer.merge(AgentStoreSqlLive, AgentTraceStoreSqlLive)
