import { PgClient } from "@effect/sql-pg"
import { sql } from "drizzle-orm"
import * as PgDrizzle from "drizzle-orm/effect-postgres"
import type {
  EffectPgQueryEffectHKT,
  EffectPgQueryResultHKT,
} from "drizzle-orm/effect-postgres"
import { migrate } from "drizzle-orm/effect-postgres/migrator"
import { readMigrationFiles } from "drizzle-orm/migrator"
import type { PgEffectDatabase } from "drizzle-orm/pg-core/effect"
import { Config, Effect, Layer, Schema } from "effect"

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

export class PendingDatabaseMigrations extends Schema.TaggedErrorClass<PendingDatabaseMigrations>()(
  "PendingDatabaseMigrations",
  {
    pending: Schema.Array(Schema.String),
  },
) {}

export class DatabaseMigrationCheckError extends Schema.TaggedErrorClass<DatabaseMigrationCheckError>()(
  "DatabaseMigrationCheckError",
  {
    cause: Schema.Defect(),
  },
) {}

type AppliedMigrationRow = {
  readonly createdAt: string
  readonly hash: string
}

const relationResultSchema = Schema.Struct({
  rows: Schema.Array(Schema.Struct({ exists: Schema.Boolean })),
})

const appliedMigrationsResultSchema = Schema.Struct({
  rows: Schema.Array(
    Schema.Struct({
      createdAt: Schema.String,
      hash: Schema.String,
    }),
  ),
})

type MigrationDatabase = PgEffectDatabase<
  EffectPgQueryEffectHKT,
  EffectPgQueryResultHKT
>

export const checkDatabaseMigrations = (
  db: MigrationDatabase,
  migrationsFolder: string,
) =>
  Effect.gen(function*() {
    const localMigrations = yield* Effect.try({
      try: () => readMigrationFiles({ migrationsFolder }),
      catch: (cause) => new DatabaseMigrationCheckError({ cause }),
    })
    const relationResult = yield* db.execute<{ readonly exists: boolean }>(sql`
      select to_regclass('drizzle.__drizzle_migrations') is not null as "exists"
    `).pipe(
      Effect.mapError((cause) => new DatabaseMigrationCheckError({ cause })),
    )
    const relation = yield* Effect.try({
      try: () => Schema.decodeUnknownSync(relationResultSchema)(relationResult),
      catch: (cause) => new DatabaseMigrationCheckError({ cause }),
    })

    if (relation.rows[0]?.exists !== true) {
      return yield* new PendingDatabaseMigrations({
        pending: localMigrations.map(({ name }) => name),
      })
    }

    const appliedMigrationsResult = yield* db.execute<AppliedMigrationRow>(sql`
      select
        "created_at"::text as "createdAt",
        "hash"
      from "drizzle"."__drizzle_migrations"
    `).pipe(
      Effect.mapError((cause) => new DatabaseMigrationCheckError({ cause })),
    )
    const appliedMigrations = yield* Effect.try({
      try: () =>
        Schema.decodeUnknownSync(appliedMigrationsResultSchema)(
          appliedMigrationsResult,
        ),
      catch: (cause) => new DatabaseMigrationCheckError({ cause }),
    })
    const pending = localMigrations.filter(
      (migration) =>
        !appliedMigrations.rows.some(
          (applied) =>
            Number(applied.createdAt) === migration.folderMillis &&
            applied.hash === migration.hash,
        ),
    )

    if (pending.length > 0) {
      return yield* new PendingDatabaseMigrations({
        pending: pending.map(({ name }) => name),
      })
    }
  })

export const checkPostgresMigrations = (migrationsFolder: string) =>
  PgDrizzle.makeWithDefaults().pipe(
    Effect.flatMap((db) => checkDatabaseMigrations(db, migrationsFolder)),
  )

export const PostgresMigrationCheckLive = Layer.effectDiscard(
  Config.string("DATABASE_MIGRATIONS_DIR").pipe(
    Config.withDefault("./drizzle"),
    Effect.flatMap(checkPostgresMigrations),
  ),
)
