import { PgClient } from "@effect/sql-pg"
import {
  FeatureFlagSnapshotReader,
  FeatureFlagSnapshotReaderLive,
  FeatureFlagSnapshotRepository,
} from "@proxus/backend-domain/feature-flags"
import {
  StudyCatalogRepository,
} from "@proxus/backend-domain/study-catalog"
import { FeatureFlagSnapshot } from "@proxus/shared/feature-flags"
import {
  CountryNode,
  CountryTypeEdge,
  StudyTypeNode,
  makeCountryNodeId,
  makeStudyEdgeId,
  makeStudyTypeNodeId,
} from "@proxus/shared/study-catalog"
import { eq, sql } from "drizzle-orm"
import * as PostgresDrizzle from "drizzle-orm/effect-postgres"
import { migrate as migratePgSession } from "drizzle-orm/pg-core/effect/session"
import { readMigrationFiles } from "drizzle-orm/migrator"
import {
  DateTime,
  Deferred,
  Effect,
  Fiber,
  Layer,
  Option,
  Schema,
} from "effect"
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest"
import {
  checkDatabaseMigrations,
  makePostgresProductionLive,
  migratePostgres,
} from "../database/postgres.js"
import { defaultMigrationsFolder } from "../database/paths.js"
import {
  authChallenges,
  authSessions,
  featureFlagSnapshots,
  roleAssignments,
  studyAssets,
  studyEdges,
  studyNodes,
  users,
} from "../database/schema.js"
import {
  FeatureFlagSnapshotRepositoryPostgresLive,
} from "../modules/feature-flags/repository.postgres.layer.js"
import {
  StudyCatalogRepositoryPostgresLive,
} from "../modules/study-catalog/repository.postgres.layer.js"

const applicationName = "proxus-postgres-tests"
const ClientLive = makePostgresProductionLive(applicationName)
const FeatureFlagRepositoryLive = FeatureFlagSnapshotRepositoryPostgresLive.pipe(
  Layer.provide(ClientLive),
)
const FeatureFlagsLive = FeatureFlagSnapshotReaderLive.pipe(
  Layer.provideMerge(FeatureFlagRepositoryLive),
)
const StudyCatalogRepositoryLive = StudyCatalogRepositoryPostgresLive.pipe(
  Layer.provide(ClientLive),
)
const TestLive = Layer.mergeAll(
  ClientLive,
  FeatureFlagsLive,
  StudyCatalogRepositoryLive,
)

type PostgresServices =
  | PgClient.PgClient
  | FeatureFlagSnapshotReader
  | FeatureFlagSnapshotRepository
  | StudyCatalogRepository

const runPostgres = <A, E>(
  effect: Effect.Effect<A, E, PostgresServices>,
) => Effect.runPromise(Effect.scoped(effect.pipe(
  // The test entry point owns the PostgreSQL Layer and its scope.
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(TestLive),
)))

const cleanProductTables = Effect.gen(function*() {
  const db = yield* PostgresDrizzle.makeWithDefaults()
  yield* db.execute(sql`
    truncate table
      ${roleAssignments},
      ${authChallenges},
      ${authSessions},
      ${users},
      ${featureFlagSnapshots},
      ${studyEdges},
      ${studyNodes},
      ${studyAssets}
  `)
})

const now = DateTime.makeUnsafe("2026-07-20T12:00:00.000Z")
const countryId = makeCountryNodeId(
  "00000000-0000-4000-8000-000000000301",
)
const firstTypeId = makeStudyTypeNodeId(
  "00000000-0000-4000-8000-000000000302",
)
const secondTypeId = makeStudyTypeNodeId(
  "00000000-0000-4000-8000-000000000303",
)
const secondCountryId = makeCountryNodeId(
  "00000000-0000-4000-8000-000000000306",
)
const firstEdgeId = makeStudyEdgeId(
  "00000000-0000-4000-8000-000000000304",
)
const secondEdgeId = makeStudyEdgeId(
  "00000000-0000-4000-8000-000000000305",
)

const country = new CountryNode({
  id: countryId,
  kind: "country",
  name: "Spain",
  imageAssetId: null,
  status: "published",
  createdAt: now,
  updatedAt: now,
})
const secondCountry = new CountryNode({
  ...country,
  id: secondCountryId,
  name: "Portugal",
})
const firstType = new StudyTypeNode({
  id: firstTypeId,
  kind: "type",
  name: "University studies",
  imageAssetId: null,
  status: "published",
  createdAt: now,
  updatedAt: now,
})
const secondType = new StudyTypeNode({
  ...firstType,
  id: secondTypeId,
  name: "Vocational studies",
})

const blockedLocksResultSchema = Schema.Struct({
  rows: Schema.Array(Schema.Struct({ waiting: Schema.Number })),
})
const migrationResultSchema = Schema.Struct({
  rows: Schema.Array(Schema.Struct({
    migrationCount: Schema.Number,
    studyEdgesTable: Schema.NullOr(Schema.String),
    studyNodesTable: Schema.NullOr(Schema.String),
    usersTable: Schema.NullOr(Schema.String),
  })),
})

const waitForBlockedSourceLocks = (
  db: Effect.Success<ReturnType<typeof PostgresDrizzle.makeWithDefaults>>,
  expected: number,
) => Effect.gen(function*() {
  while (true) {
    const result = yield* db.execute<{ readonly waiting: number }>(sql`
      select count(*)::int as "waiting"
      from pg_stat_activity
      where datname = current_database()
        and application_name = ${applicationName}
        and wait_event_type = 'Lock'
        and query ilike '%study_nodes%'
        and query ilike '%for update%'
    `)
    const decoded = yield* Schema.decodeUnknownEffect(
      blockedLocksResultSchema,
    )(result)
    const waiting = decoded.rows[0]?.waiting ?? 0
    if (waiting === expected) return waiting
  }
}).pipe(Effect.timeout("10 seconds"))

describe("real PostgreSQL 17", () => {
  beforeAll(
    () => runPostgres(migratePostgres(defaultMigrationsFolder)),
    20_000,
  )
  beforeEach(() => runPostgres(cleanProductTables), 20_000)
  afterEach(() => runPostgres(cleanProductTables), 20_000)

  test("applies the real migrations and passes the migration check", () =>
    runPostgres(Effect.gen(function*() {
      yield* migratePostgres(defaultMigrationsFolder)
      const db = yield* PostgresDrizzle.makeWithDefaults()
      yield* checkDatabaseMigrations(db, defaultMigrationsFolder)

      const result = yield* db.execute<{
        readonly migrationCount: number
        readonly studyEdgesTable: string | null
        readonly studyNodesTable: string | null
        readonly usersTable: string | null
      }>(sql`
        select
          count(*)::int as "migrationCount",
          to_regclass('public.study_edges')::text as "studyEdgesTable",
          to_regclass('public.study_nodes')::text as "studyNodesTable",
          to_regclass('public.users')::text as "usersTable"
        from drizzle.__drizzle_migrations
      `)
      const decoded = yield* Schema.decodeUnknownEffect(
        migrationResultSchema,
      )(result)
      expect(decoded.rows[0]).toMatchObject({
        migrationCount: 6,
        studyEdgesTable: "study_edges",
        studyNodesTable: "study_nodes",
        usersTable: "users",
      })
    })), 20_000)

  test("enforces auth normalization, purpose and scope constraints", () =>
    runPostgres(Effect.gen(function*() {
      const db = yield* PostgresDrizzle.makeWithDefaults()
      const subject = "00000000-0000-4000-8000-000000000451"
      const user = "00000000-0000-4000-8000-000000000452"
      yield* db.execute(sql`insert into study_nodes (id, kind, name, status, created_at, updated_at)
        values (${subject}::uuid, 'subject', 'Auth subject', 'published', now(), now())`)
      yield* db.execute(sql`insert into users
        (id, email_normalized, status, password_hash, google_subject, username_normalized,
         birth_year, problem_kind, subject_id, validated_node_ids, created_at, updated_at)
        values (${user}::uuid, 'valid@example.com', 'active', 'hash', 'google-valid', 'valid_user',
          2001, 'prepare-exams', ${subject}::uuid,
          '["00000000-0000-4000-8000-000000000451","00000000-0000-4000-8000-000000000451","00000000-0000-4000-8000-000000000451","00000000-0000-4000-8000-000000000451","00000000-0000-4000-8000-000000000451"]'::jsonb, now(), now())`)

      const invalidStatements = [
        sql`update users set email_normalized = 'Not-Normalized@example.com' where id = ${user}::uuid`,
        sql`update users set username_normalized = 'Invalid-Name' where id = ${user}::uuid`,
        sql`update users set google_subject = '   ' where id = ${user}::uuid`,
        sql`insert into auth_challenges (id, user_id, purpose, code_hash, expires_at, maximum_attempts, created_at)
          values (gen_random_uuid(), ${user}::uuid, 'login', 'hash', now(), 5, now())`,
        sql`insert into role_assignments (user_id, role, scope_type, scope_id, granted_by, granted_at)
          values (${user}::uuid, 'student', 'organization', 'global', ${user}::uuid, now())`,
      ]
      for (const statement of invalidStatements) {
        const result = yield* Effect.exit(db.execute(statement))
        expect(result._tag).toBe("Failure")
      }
    })), 20_000)

  test("upgrades legacy Feature Flags rows for repository and HTTP-facing reader access", () =>
    runPostgres(Effect.gen(function*() {
      const db = yield* PostgresDrizzle.makeWithDefaults()
      yield* db.execute(sql`drop table if exists ${roleAssignments} cascade`)
      yield* db.execute(sql`drop table if exists ${authChallenges} cascade`)
      yield* db.execute(sql`drop table if exists ${authSessions} cascade`)
      yield* db.execute(sql`drop table if exists ${users} cascade`)
      yield* db.execute(sql`drop table if exists ${featureFlagSnapshots} cascade`)
      yield* db.execute(sql`drop table if exists ${studyEdges} cascade`)
      yield* db.execute(sql`drop table if exists ${studyNodes} cascade`)
      yield* db.execute(sql`drop table if exists ${studyAssets} cascade`)
      yield* db.execute(sql`drop function if exists prevent_feature_flag_snapshot_revision_mutation()`)
      yield* db.execute(sql`drop schema if exists drizzle cascade`)

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

      yield* migratePostgres(defaultMigrationsFolder)
      expect(yield* db.select().from(featureFlagSnapshots)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            configurationRevision: 3n,
            configuration: [],
            active: true,
          }),
          expect.objectContaining({
            configurationRevision: 1n,
            configuration: [],
            active: false,
          }),
          expect.objectContaining({
            configurationRevision: 2n,
            configuration: [],
            active: false,
          }),
        ]),
      )

      const expected = { configurationRevision: 3, flags: [] } as const
      const repository = yield* FeatureFlagSnapshotRepository
      expect(yield* repository.readActive()).toEqual(expected)
      const reader = yield* FeatureFlagSnapshotReader
      expect(yield* reader.getActiveSnapshot()).toEqual(expected)
    })), 20_000)

  test("publishes and reads Feature Flags revision 1", () =>
    runPostgres(Effect.gen(function*() {
      const repository = yield* FeatureFlagSnapshotRepository
      const snapshot = {
        configurationRevision: 1,
        flags: [{
          key: "registration.landing",
          enabled: true,
          allocationVersion: 1,
          default: "short",
          variants: [
            { value: "short", weight: 5_000 },
            { value: "long", weight: 5_000 },
          ],
        }],
      } as const

      expect(yield* repository.readActive()).toBeNull()
      yield* repository.publish(snapshot)
      expect(yield* repository.readActive()).toEqual(snapshot)
    })), 20_000)

  test("creates and reads a Study Catalog node", () =>
    runPostgres(Effect.gen(function*() {
      const repository = yield* StudyCatalogRepository
      expect(yield* repository.createNode(country)).toEqual(country)
      expect(
        Option.getOrNull(yield* repository.findNodeById(countryId)),
      ).toEqual(country)
    })), 20_000)

  test("serializes two edge inserts with the source row lock", () =>
    runPostgres(Effect.gen(function*() {
      const db = yield* PostgresDrizzle.makeWithDefaults()
      const repository = yield* StudyCatalogRepository
      yield* Effect.forEach(
        [country, firstType, secondType],
        repository.createNode,
        { discard: true },
      )

      const sourceLocked = yield* Deferred.make<void>()
      const releaseSource = yield* Deferred.make<void>()
      const blocker = yield* Effect.forkChild(
        db.transaction((tx) => Effect.gen(function*() {
          yield* tx
            .select({ id: studyNodes.id })
            .from(studyNodes)
            .where(eq(studyNodes.id, countryId))
            .for("update")
          yield* Deferred.succeed(sourceLocked, undefined)
          yield* Deferred.await(releaseSource)
        })),
        { startImmediately: true },
      )
      yield* Deferred.await(sourceLocked)

      const created = yield* Effect.gen(function*() {
        const first = yield* Effect.forkChild(repository.createEdge(
          new CountryTypeEdge({
            id: firstEdgeId,
            from: countryId,
            to: firstTypeId,
            position: 0,
          }),
        ), { startImmediately: true })
        const second = yield* Effect.forkChild(repository.createEdge(
          new CountryTypeEdge({
            id: secondEdgeId,
            from: countryId,
            to: secondTypeId,
            position: 0,
          }),
        ), { startImmediately: true })

        expect(yield* waitForBlockedSourceLocks(db, 2)).toBe(2)
        yield* Deferred.succeed(releaseSource, undefined)
        const edges = yield* Effect.all(
          [Fiber.join(first), Fiber.join(second)],
          { concurrency: 2 },
        )
        yield* Fiber.join(blocker)
        return edges
      }).pipe(
        Effect.ensuring(Deferred.succeed(releaseSource, undefined)),
      )

      expect(created.map(({ position }) => position).sort()).toEqual([0, 1])
      expect(
        (yield* repository.listOutgoingEdges(countryId)).map(
          ({ position }) => position,
        ),
      ).toEqual([0, 1])
    })), 20_000)

  test("serializes concurrent edge update and remove before either locks an edge", () =>
    runPostgres(Effect.gen(function*() {
      const db = yield* PostgresDrizzle.makeWithDefaults()
      const repository = yield* StudyCatalogRepository
      yield* Effect.forEach(
        [country, firstType, secondType],
        repository.createNode,
        { discard: true },
      )
      yield* repository.createEdge(new CountryTypeEdge({
        id: firstEdgeId,
        from: countryId,
        to: firstTypeId,
        position: 0,
      }))
      yield* repository.createEdge(new CountryTypeEdge({
        id: secondEdgeId,
        from: countryId,
        to: secondTypeId,
        position: 0,
      }))

      const sourceLocked = yield* Deferred.make<void>()
      const releaseSource = yield* Deferred.make<void>()
      const blocker = yield* Effect.forkChild(
        db.transaction((tx) => Effect.gen(function*() {
          yield* tx
            .select({ id: studyNodes.id })
            .from(studyNodes)
            .where(eq(studyNodes.id, countryId))
            .for("update")
          yield* Deferred.succeed(sourceLocked, undefined)
          yield* Deferred.await(releaseSource)
        })),
        { startImmediately: true },
      )
      yield* Deferred.await(sourceLocked)

      yield* Effect.gen(function*() {
        const update = yield* Effect.forkChild(repository.updateEdge(
          firstEdgeId,
          { from: countryId, to: firstTypeId, position: 1 },
        ), { startImmediately: true })
        const remove = yield* Effect.forkChild(
          repository.removeEdge(secondEdgeId),
          { startImmediately: true },
        )

        expect(yield* waitForBlockedSourceLocks(db, 2)).toBe(2)
        yield* Deferred.succeed(releaseSource, undefined)
        yield* Effect.all(
          [Fiber.join(update), Fiber.join(remove)],
          { concurrency: 2 },
        )
        yield* Fiber.join(blocker)
      }).pipe(
        Effect.ensuring(Deferred.succeed(releaseSource, undefined)),
      )

      expect(yield* repository.listOutgoingEdges(countryId)).toEqual([
        new CountryTypeEdge({
          id: firstEdgeId,
          from: countryId,
          to: firstTypeId,
          position: 0,
        }),
      ])
    })), 20_000)

  test("retries an edge update when its source changes while source locks are pending", () =>
    runPostgres(Effect.gen(function*() {
      const db = yield* PostgresDrizzle.makeWithDefaults()
      const repository = yield* StudyCatalogRepository
      yield* Effect.forEach(
        [country, secondCountry, firstType],
        repository.createNode,
        { discard: true },
      )
      yield* repository.createEdge(new CountryTypeEdge({
        id: firstEdgeId,
        from: countryId,
        to: firstTypeId,
        position: 0,
      }))

      const sourceLocked = yield* Deferred.make<void>()
      const moveSource = yield* Deferred.make<void>()
      const blocker = yield* Effect.forkChild(
        db.transaction((tx) => Effect.gen(function*() {
          yield* tx
            .select({ id: studyNodes.id })
            .from(studyNodes)
            .where(eq(studyNodes.id, countryId))
            .for("update")
          yield* Deferred.succeed(sourceLocked, undefined)
          yield* Deferred.await(moveSource)
          yield* tx
            .update(studyEdges)
            .set({ fromNodeId: secondCountryId })
            .where(eq(studyEdges.id, firstEdgeId))
        })),
        { startImmediately: true },
      )
      yield* Deferred.await(sourceLocked)

      const updated = yield* Effect.gen(function*() {
        const update = yield* Effect.forkChild(repository.updateEdge(
          firstEdgeId,
          { from: countryId, to: firstTypeId, position: 0 },
        ), { startImmediately: true })
        expect(yield* waitForBlockedSourceLocks(db, 1)).toBe(1)
        yield* Deferred.succeed(moveSource, undefined)
        yield* Fiber.join(blocker)
        return yield* Fiber.join(update)
      }).pipe(
        Effect.ensuring(Deferred.succeed(moveSource, undefined)),
      )

      expect(updated).toEqual(new CountryTypeEdge({
        id: firstEdgeId,
        from: countryId,
        to: firstTypeId,
        position: 0,
      }))
    })), 20_000)
})
