// @effect-diagnostics processEnv:off
import { PgClient } from "@effect/sql-pg"
import { AgentStore } from "@proxus/agent-harness/store"
import { Effect, Layer, Redacted } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"
import { describe, test } from "vitest"
import { defaultMigrationsFolder } from "../../../../database/paths.js"
import { migratePostgres } from "../../../../database/postgres.js"
import { makeAgentStoreSql } from "../shared/layer.js"
import { agentStoreContract } from "../test/agent-store-contract.js"

const url = process.env.AGENT_STORE_POSTGRES_URL

const postgresAgentStoreTestLayer = (databaseUrl: string) => {
  const client = PgClient.layer({
    url: Redacted.make(databaseUrl),
    applicationName: "proxus-agent-store-contract",
  })
  return Layer.effect(AgentStore, Effect.gen(function*() {
    yield* migratePostgres(defaultMigrationsFolder)
    const sql = yield* SqlClient
    yield* sql`truncate table agent_run_claims, agent_checkpoints, agent_journal, agent_session_entries, agent_runs, agent_sessions restart identity cascade`
    return yield* makeAgentStoreSql
  })).pipe(Layer.provide(client))
}

if (url !== undefined && url !== "") {
  agentStoreContract("PostgreSQL", () => postgresAgentStoreTestLayer(url))
} else {
  describe.skip("PostgreSQL AgentStore contract", () => {
    test("requires AGENT_STORE_POSTGRES_URL", () => undefined)
  })
}
