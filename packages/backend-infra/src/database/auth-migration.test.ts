import { PgliteClient } from "@effect/sql-pglite"
import { sql } from "drizzle-orm"
import * as PgliteDrizzle from "drizzle-orm/effect-pglite"
import { migrate as migratePgSession } from "drizzle-orm/pg-core/effect/session"
import { readMigrationFiles } from "drizzle-orm/migrator"
import { DateTime, Effect, Layer, Schema } from "effect"
import { describe, expect, test } from "vitest"
import { defaultMigrationsFolder } from "./paths.js"
import { migratePglite } from "./pglite.js"
import { users } from "./schema.js"

const acquisitionMigrationName = "20260731071341_fuzzy_queen_noir"
const subjectId = "00000000-0000-4000-8000-000000000401"
const userId = "00000000-0000-4000-8000-000000000402"
const grantorId = "00000000-0000-4000-8000-000000000403"
const now = DateTime.toDateUtc(DateTime.makeUnsafe("2026-07-21T12:00:00.000Z"))

const withDatabase = <A, E>(effect: Effect.Effect<A, E, PgliteClient.PgliteClient>) =>
  Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const context = yield* Layer.build(PgliteClient.layer())
    return yield* effect.pipe(Effect.provide(context))
  })))

const insertValidUsers = Effect.gen(function*() {
  const db = yield* PgliteDrizzle.makeWithDefaults()
  const base = {
    emailNormalized: "learner@example.com",
    status: "active" as const,
    emailVerifiedAt: now,
    passwordHash: "password-hash",
    googleSubject: "google-learner",
    usernameNormalized: "learner_1",
    birthYear: 2001,
    problemKind: "prepare-exams" as const,
    problemOther: null,
    acquisitionSource: "friend" as const,
    acquisitionOther: null,
    studyId: subjectId,
    subjectId,
    createdAt: now,
    updatedAt: now,
  }
  yield* db.insert(users).values([
    { id: userId, ...base },
    {
      id: grantorId,
      ...base,
      emailNormalized: "admin@example.com",
      googleSubject: "google-admin",
      usernameNormalized: "admin_1",
    },
  ])
})

const expectRejected = <A, E>(effect: Effect.Effect<A, E, never>) =>
  effect.pipe(Effect.exit, Effect.map((exit) => expect(exit._tag).toBe("Failure")))

describe("auth database migration", () => {
  test("migrates an empty database and enforces auth constraints", () => withDatabase(Effect.gen(function*() {
    const db = yield* PgliteDrizzle.makeWithDefaults()
    yield* migratePglite(defaultMigrationsFolder)

    const tables = yield* db.execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public'
        and table_name in ('users', 'auth_sessions', 'auth_challenges', 'role_assignments')
      order by table_name
    `)
    const decodedTables = yield* Schema.decodeUnknownEffect(Schema.Struct({
      rows: Schema.Array(Schema.Struct({ table_name: Schema.String })),
    }))(tables)
    expect(decodedTables.rows.map(({ table_name }) => table_name)).toEqual([
      "auth_challenges", "auth_sessions", "role_assignments", "users",
    ])

    yield* db.execute(sql`insert into study_nodes (id, kind, name, status, created_at, updated_at)
      values (${subjectId}::uuid, 'subject', 'Databases', 'published', now(), now())`)
    yield* insertValidUsers

    const invalidUser = (email: string, username: string, googleSubject: string | null) =>
      db.execute(sql`insert into users
        (id, email_normalized, status, email_verified_at, password_hash, google_subject,
         username_normalized, birth_year, problem_kind, problem_other, subject_id,
         study_id, acquisition_source, acquisition_other, created_at, updated_at)
        values (gen_random_uuid(), ${email}, 'active', now(), 'hash', ${googleSubject},
          ${username}, 2001, 'prepare-exams', null, ${subjectId}::uuid,
          ${subjectId}::uuid, 'friend', null, now(), now())`)

    yield* expectRejected(invalidUser("Not-Normalized@example.com", "valid_name", "subject-1"))
    yield* expectRejected(invalidUser("valid-email@example.com", "Invalid-Name", "subject-2"))
    yield* expectRejected(invalidUser("valid-email-2@example.com", "valid_name", "   "))
    yield* expectRejected(db.execute(sql`insert into auth_challenges
      (id, user_id, purpose, code_hash, expires_at, failed_attempts, maximum_attempts, created_at)
      values (gen_random_uuid(), ${userId}::uuid, 'login', 'hash', now(), 0, 5, now())`))
    yield* expectRejected(db.execute(sql`insert into role_assignments
      (user_id, role, scope_type, scope_id, granted_by, granted_at)
      values (${userId}::uuid, 'student', 'organization', 'global', ${grantorId}::uuid, now())`))
  })), 20_000)

  test("upgrades the populated previous revision without changing existing rows", () => withDatabase(Effect.gen(function*() {
    const db = yield* PgliteDrizzle.makeWithDefaults()
    const migrations = readMigrationFiles({ migrationsFolder: defaultMigrationsFolder })
    const acquisitionMigration = migrations.findIndex(
      ({ name }) => name === acquisitionMigrationName,
    )
    expect(acquisitionMigration).toBeGreaterThan(0)
    yield* migratePgSession(migrations.slice(0, acquisitionMigration), db._.session, {
      migrationsFolder: defaultMigrationsFolder,
    })
    yield* db.execute(sql`insert into study_nodes (id, kind, name, status, created_at, updated_at)
      values (${subjectId}::uuid, 'subject', 'Existing subject', 'published', now(), now())`)
    yield* db.execute(sql`insert into users
      (id, email_normalized, status, email_verified_at, password_hash, google_subject,
       username_normalized, birth_year, problem_kind, problem_other, subject_id,
       study_id, created_at, updated_at)
      values (${userId}::uuid, 'existing@example.com', 'active', now(), 'hash', null,
        'existing_user', 2001, 'prepare-exams', null, ${subjectId}::uuid,
        ${subjectId}::uuid, now(), now())`)

    yield* migratePglite(defaultMigrationsFolder)
    const existing = yield* db.execute<{ name: string }>(sql`
      select name from study_nodes where id = ${subjectId}::uuid
    `)
    const decodedExisting = yield* Schema.decodeUnknownEffect(Schema.Struct({
      rows: Schema.Array(Schema.Struct({ name: Schema.String })),
    }))(existing)
    expect(decodedExisting.rows).toEqual([{ name: "Existing subject" }])
    const migratedUsers = yield* db.select().from(users)
    expect(migratedUsers).toHaveLength(1)
    expect(migratedUsers[0]).toMatchObject({
      studyId: subjectId,
      subjectId,
      acquisitionSource: "legacy",
      acquisitionOther: null,
    })
  })), 20_000)
})
