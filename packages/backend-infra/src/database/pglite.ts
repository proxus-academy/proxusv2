import { PgliteClient } from "@effect/sql-pglite"
import * as PgDrizzle from "drizzle-orm/effect-pglite"
import { migrate } from "drizzle-orm/effect-pglite/migrator"
import { Config, Effect, Layer } from "effect"
import { defaultMigrationsFolder } from "./paths.js"
export { defaultMigrationsFolder } from "./paths.js"
import { seedStudyCatalog } from "./study-catalog.seed.js"

export const PgliteDevelopmentLive = PgliteClient.layerConfig({
  dataDir: Config.string("PGLITE_DATA_DIR").pipe(
    Config.withDefault("./.data"),
  ),
})

export const PgliteLive = (dataDir?: string) =>
  PgliteClient.layer(dataDir === undefined ? {} : { dataDir })

export const migratePglite = (migrationsFolder: string) =>
  Effect.gen(function*() {
    const db = yield* PgDrizzle.makeWithDefaults()
    yield* migrate(db, { migrationsFolder })
  })

/** Idempotent setup for isolated compositions that need the canonical catalog. */
export const seedPgliteStudyCatalog = Effect.gen(function*() {
  const db = yield* PgDrizzle.makeWithDefaults()
  yield* seedStudyCatalog(db)
})

export const PgliteMigrationLive = Layer.effectDiscard(
  Config.string("DATABASE_MIGRATIONS_DIR").pipe(
    Config.withDefault(defaultMigrationsFolder),
    Effect.flatMap(migratePglite),
  ),
)
