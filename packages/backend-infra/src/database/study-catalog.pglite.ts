import * as PgDrizzle from "drizzle-orm/effect-pglite"
import { migrate } from "drizzle-orm/effect-pglite/migrator"
import { sql } from "drizzle-orm"
import { Effect } from "effect"
import { seedStudyCatalog } from "./study-catalog.seed.js"

export const seedPgliteStudyCatalog = (migrationsFolder: string) =>
  Effect.gen(function*() {
    const db = yield* PgDrizzle.makeWithDefaults()
    yield* migrate(db, { migrationsFolder })
    yield* seedStudyCatalog(db)
  })

export const resetPgliteStudyCatalog = (migrationsFolder: string) =>
  Effect.gen(function*() {
    const db = yield* PgDrizzle.makeWithDefaults()
    yield* db.execute(sql`drop schema if exists drizzle cascade`)
    yield* db.execute(sql`drop schema if exists public cascade`)
    yield* db.execute(sql`create schema public`)
    yield* migrate(db, { migrationsFolder })
    yield* seedStudyCatalog(db)
  })
