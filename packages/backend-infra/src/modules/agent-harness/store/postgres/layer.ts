import { AgentStoreSqlLive } from "../shared/layer.js"

/** PostgreSQL store implementation. Provide a PgClient Layer at the composition root. */
export const PostgresAgentStoreLive = AgentStoreSqlLive
