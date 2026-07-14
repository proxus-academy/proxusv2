import { PgliteClient } from "@effect/sql-pglite"
import * as PgDrizzle from "drizzle-orm/effect-pglite"
import { migrate } from "drizzle-orm/effect-pglite/migrator"
import { Effect } from "effect"

export const PgliteLive = (dataDir?: string) =>
  PgliteClient.layer(dataDir === undefined ? {} : { dataDir })

export const migratePglite = (migrationsFolder: string) =>
  Effect.gen(function*() {
    const db = yield* PgDrizzle.makeWithDefaults()
    yield* migrate(db, { migrationsFolder })
  })
