import { PgClient } from "@effect/sql-pg"
import { AuthTypes, Connector } from "@google-cloud/cloud-sql-connector"
import pg from "pg"
import { sql } from "drizzle-orm"
import * as PgDrizzle from "drizzle-orm/effect-postgres"
import type {
  EffectPgQueryEffectHKT,
  EffectPgQueryResultHKT,
} from "drizzle-orm/effect-postgres"
import { migrate } from "drizzle-orm/effect-postgres/migrator"
import { readMigrationFiles } from "drizzle-orm/migrator"
import type { PgEffectDatabase } from "drizzle-orm/pg-core/effect"
import { Config, Effect, Layer, Redacted, Schema } from "effect"
import { defaultMigrationsFolder } from "./paths.js"
import { runtimeDefaultPrivilegesSql } from "./runtime-default-privileges.sql.js"

const cloudSqlConnectorLayer = (applicationName: string, authType: AuthTypes) => PgClient.layerFrom(
  Effect.acquireRelease(
    Effect.gen(function* () {
      const connectionName = yield* Config.string("CLOUD_SQL_CONNECTION_NAME")
      const database = yield* Config.string("DATABASE_NAME")
      const user = yield* Config.string("DATABASE_USER")
      const password = authType === AuthTypes.PASSWORD
        ? Redacted.value(yield* Config.redacted("DATABASE_PASSWORD"))
        : undefined
      const connector = new Connector()
      const options = yield* Effect.promise(() => connector.getOptions({
        instanceConnectionName: connectionName,
        authType,
      }))
      const pool = new pg.Pool({ ...options, user, database, ...(password === undefined ? {} : { password }), application_name: applicationName })
      return { connector, pool }
    }),
    ({ connector, pool }) => Effect.promise(() => pool.end().then(() => connector.close())),
  ).pipe(Effect.flatMap(({ pool }) => PgClient.fromPool({ acquire: Effect.succeed(pool), applicationName }))),
)

/** DATABASE_URL remains the default contract; Cloud SQL adapters never construct or persist a password URL. */
export const makePostgresProductionLive = (applicationName: string) =>
  Layer.unwrap(
    Config.string("DATABASE_ADAPTER").pipe(
      Config.withDefault("database-url"),
      Effect.map((adapter) => {
        if (adapter === "cloud-sql-iam") return cloudSqlConnectorLayer(applicationName, AuthTypes.IAM)
        if (adapter === "cloud-sql-password") return cloudSqlConnectorLayer(applicationName, AuthTypes.PASSWORD)
        return PgClient.layerConfig({
          url: Config.redacted("DATABASE_URL"),
          applicationName: Config.succeed(applicationName),
        })
      }),
    ),
  )

export const migratePostgres = (migrationsFolder: string, runtimeRole?: string) =>
  Effect.gen(function*() {
    const db = yield* PgDrizzle.makeWithDefaults()
    yield* migrate(db, { migrationsFolder })
    if (runtimeRole !== undefined) {
      yield* db.transaction((tx) => Effect.forEach(
        runtimeDefaultPrivilegesSql(runtimeRole),
        (statement) => tx.execute(sql.raw(statement)),
        { discard: true },
      ))
    }
  })

export const PostgresMigrationLive = Layer.effectDiscard(
  Effect.all([
    Config.string("DATABASE_MIGRATIONS_DIR").pipe(Config.withDefault(defaultMigrationsFolder)),
    Config.string("DATABASE_RUNTIME_ROLE").pipe(Config.withDefault("")),
  ]).pipe(Effect.flatMap(([folder, runtimeRole]) => migratePostgres(folder, runtimeRole || undefined))),
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
    Config.withDefault(defaultMigrationsFolder),
    Effect.flatMap(checkPostgresMigrations),
  ),
)
