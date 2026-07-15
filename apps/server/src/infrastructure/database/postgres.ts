import { PgClient } from "@effect/sql-pg"
import * as PgDrizzle from "drizzle-orm/effect-postgres"
import { migrate } from "drizzle-orm/effect-postgres/migrator"
import { Config, Effect, Layer } from "effect"

export const PostgresProductionLive = PgClient.layerConfig({
  url: Config.redacted("DATABASE_URL"),
  applicationName: Config.succeed("proxus-server"),
})

export const migratePostgres = (migrationsFolder: string) =>
  Effect.gen(function*() {
    const db = yield* PgDrizzle.makeWithDefaults()
    yield* migrate(db, { migrationsFolder })
  })

export const PostgresMigrationLive = Layer.effectDiscard(
  Config.string("DATABASE_MIGRATIONS_DIR").pipe(
    Config.withDefault("./drizzle"),
    Effect.flatMap(migratePostgres),
  ),
)
