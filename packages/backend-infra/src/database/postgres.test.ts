import { PgliteClient } from "@effect/sql-pglite"
import {
  FeatureFlagSnapshotReader,
  FeatureFlagSnapshotReaderLive,
  FeatureFlagSnapshotRepository,
} from "@proxus/backend-domain/feature-flags"
import { FeatureFlagSnapshot } from "@proxus/shared/feature-flags"
import * as PgliteDrizzle from "drizzle-orm/effect-pglite"
import { migrate as migratePgSession } from "drizzle-orm/pg-core/effect/session"
import { readMigrationFiles } from "drizzle-orm/migrator"
import { describe, expect, test } from "vitest"
import { Effect, Layer, Schema } from "effect"
import { defaultMigrationsFolder } from "./paths.js"
import { migratePglite } from "./pglite.js"
import { FeatureFlagSnapshotRepositoryPgliteLive } from "../modules/feature-flags/repository.pglite.layer.js"
import { featureFlagSnapshots } from "./schema.js"
import { checkDatabaseMigrations } from "./postgres.js"

describe("database migration check", () => {
  test(
    "normalizes the revision-zero upgrade for repository and HTTP-facing reader access",
    () => {
      const ClientLive = PgliteClient.layer()

      return Effect.runPromise(
        Effect.scoped(
          Effect.gen(function*() {
            const context = yield* Layer.build(ClientLive)
            return yield* Effect.gen(function*() {
              const db = yield* PgliteDrizzle.makeWithDefaults()
              const migrations = readMigrationFiles({
                migrationsFolder: defaultMigrationsFolder,
              })
              const revisionOneMigration = migrations.findIndex(
                ({ name }) => name === "20260720140602_tiny_frightful_four",
              )
              expect(revisionOneMigration).toBe(4)
              yield* migratePgSession(
                migrations.slice(0, revisionOneMigration),
                db._.session,
                { migrationsFolder: defaultMigrationsFolder },
              )

              const revisionZero = yield* Schema.decodeUnknownEffect(
                FeatureFlagSnapshot,
              )({ configurationRevision: 0, flags: [] })
              const revisionOne = yield* Schema.decodeUnknownEffect(
                FeatureFlagSnapshot,
              )({ configurationRevision: 1, flags: [] })
              yield* db.insert(featureFlagSnapshots).values([
                {
                  configurationRevision: 0n,
                  configuration: revisionZero,
                  active: true,
                },
                {
                  configurationRevision: 1n,
                  configuration: revisionOne,
                  active: false,
                },
                {
                  configurationRevision: 2n,
                  configuration: [],
                  active: false,
                },
              ])

              yield* migratePglite(defaultMigrationsFolder)
              const rows = yield* db.select().from(featureFlagSnapshots)
              expect(rows).toHaveLength(3)
              expect(rows).toContainEqual(expect.objectContaining({
                configurationRevision: 3n,
                configuration: [],
                active: true,
              }))
              expect(rows).toContainEqual(expect.objectContaining({
                configurationRevision: 1n,
                configuration: [],
                active: false,
              }))
              expect(rows).toContainEqual(expect.objectContaining({
                configurationRevision: 2n,
                configuration: [],
                active: false,
              }))

              const featureFlags = yield* Layer.build(
                FeatureFlagSnapshotReaderLive.pipe(
                  Layer.provideMerge(FeatureFlagSnapshotRepositoryPgliteLive),
                ),
              )
              yield* Effect.gen(function*() {
                const expected = { configurationRevision: 3, flags: [] } as const
                const repository = yield* FeatureFlagSnapshotRepository
                expect(yield* repository.readActive()).toEqual(expected)
                const reader = yield* FeatureFlagSnapshotReader
                expect(yield* reader.getActiveSnapshot()).toEqual(expected)
              }).pipe(Effect.provide(featureFlags))

              const immutable = yield* Effect.exit(
                db.update(featureFlagSnapshots).set({
                  configuration: [{ changed: true }],
                }),
              )
              expect(immutable._tag).toBe("Failure")
              const zeroRejected = yield* Effect.exit(
                db.insert(featureFlagSnapshots).values({
                  configurationRevision: 0n,
                  configuration: [],
                  active: false,
                }),
              )
              expect(zeroRejected._tag).toBe("Failure")
            }).pipe(Effect.provide(context))
          }),
        ),
      )
    },
    15_000,
  )

  test(
    "fails while migrations are pending and succeeds after they are applied",
    () => {
      const ClientLive = PgliteClient.layer()

      return Effect.runPromise(
        Effect.scoped(
          Effect.gen(function*() {
            const context = yield* Layer.build(ClientLive)
            return yield* Effect.gen(function*() {
              const db = yield* PgliteDrizzle.makeWithDefaults()
              const migrations = readMigrationFiles({
                migrationsFolder: defaultMigrationsFolder,
              })
              const pending = yield* checkDatabaseMigrations(
                db,
                defaultMigrationsFolder,
              ).pipe(Effect.flip)

              expect(pending._tag).toBe("PendingDatabaseMigrations")
              if (pending._tag === "PendingDatabaseMigrations") {
                expect(pending.pending).toHaveLength(migrations.length)
              }

              yield* migratePglite(defaultMigrationsFolder)
              yield* checkDatabaseMigrations(db, defaultMigrationsFolder)
            }).pipe(Effect.provide(context))
          }),
        ),
      )
    },
    15_000,
  )
})
