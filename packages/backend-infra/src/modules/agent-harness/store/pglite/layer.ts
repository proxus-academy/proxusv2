import { PgliteClient } from "@effect/sql-pglite"
import { AgentStore } from "@proxus/agent-harness/store"
import { Effect, Layer } from "effect"
import { migratePglite } from "../../../../database/pglite.js"
import { defaultMigrationsFolder } from "../../../../database/paths.js"
import { AgentStoreSqlLive, makeAgentStoreSql } from "../shared/layer.js"

/** PGlite store implementation. Provide a PgliteClient Layer at the composition root. */
export const PgliteAgentStoreLive = AgentStoreSqlLive

/**
 * Persistent local/test composition. It applies the canonical backend-infra
 * Drizzle migrations before exposing AgentStore. Migration and runtime receive
 * the same PGlite client Layer by identity.
 */
export const pgliteAgentStoreLayer = (
  dataDir?: string,
  migrationsFolder = defaultMigrationsFolder,
) => {
  const client = PgliteClient.layer(dataDir === undefined ? {} : { dataDir })
  return Layer.effect(
    AgentStore,
    migratePglite(migrationsFolder).pipe(Effect.andThen(makeAgentStoreSql)),
  ).pipe(Layer.provide(client))
}
