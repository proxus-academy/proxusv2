import { RoleAssignmentsRepositoryPostgresLive } from "../modules/access-control/repository.postgres.layer.js"
import { PasswordsLive } from "../modules/auth/passwords.live.js"
import { makeAuthPersistencePostgresLive } from "../modules/auth/runtime.postgres.js"
import { resolveAuthQaStudyPathPostgres } from "../auth-qa/catalog.js"
import { seedAuthQa } from "../auth-qa/fixtures.js"
import * as PostgresDrizzle from "drizzle-orm/effect-postgres"
import { Config, Effect, Layer } from "effect"
import { makePostgresProductionLive, migratePostgres } from "./postgres.js"
import { seedStudyCatalog } from "./study-catalog.seed.js"
import { seedUgcPreviewFixtures } from "./ugc.seed.js"

const day = 86_400_000

/** Explicit, idempotent initialization for a newly-created synthetic preview database. */
export const initializePreviewDatabase = Effect.gen(function*() {
  const migrations = yield* Config.string("DATABASE_MIGRATIONS_DIR").pipe(Config.withDefault("./drizzle"))
  const database = makePostgresProductionLive("proxus-preview-initialize")
  const persistence = Layer.mergeAll(
    RoleAssignmentsRepositoryPostgresLive,
    makeAuthPersistencePostgresLive(30 * day),
    PasswordsLive,
  ).pipe(Layer.provide(database))
  const databaseContext = yield* Layer.build(database)
  yield* migratePostgres(migrations).pipe(Effect.provide(databaseContext))
  const db = yield* PostgresDrizzle.makeWithDefaults().pipe(Effect.provide(databaseContext))
  yield* seedStudyCatalog(db)
  const path = yield* resolveAuthQaStudyPathPostgres(db)
  const persistenceContext = yield* Layer.build(persistence)
  yield* seedAuthQa(path).pipe(Effect.provide(persistenceContext))
  yield* seedUgcPreviewFixtures(db)
})
