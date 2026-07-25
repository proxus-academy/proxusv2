// Drizzle's Effect integration currently exposes its v3-compatible constructor under Effect v4.
// @effect-diagnostics outdatedApi:off anyUnknownInErrorContext:off missingEffectContext:off
import { RoleAssignmentsRepository } from "@proxus/backend-domain/access-control"
import { UserRepository } from "@proxus/backend-domain/auth"
import * as PgDrizzle from "drizzle-orm/effect-pglite"
import * as PostgresDrizzle from "drizzle-orm/effect-postgres"
import { Config, Effect, Layer, Option } from "effect"
import { defaultMigrationsFolder } from "../database/paths.js"
import { migratePglite, PgliteDevelopmentLive } from "../database/pglite.js"
import { checkPostgresMigrations, makePostgresProductionLive } from "../database/postgres.js"
import { seedPgliteStudyCatalog } from "../database/study-catalog.pglite.js"
import { makeRoleAssignmentsRepositoryDrizzle } from "../modules/access-control/repository.drizzle.js"
import { PasswordsLive } from "../modules/auth/passwords.live.js"
import { makeUserRepositoryDrizzle } from "../modules/auth/repositories.drizzle.js"
import { authQaStudyPath, resolveAuthQaStudyPath, resolveAuthQaStudyPathPostgres } from "./catalog.js"
import { listAuthQa, seedAuthQa } from "./fixtures.js"

const action = process.argv[2]
if (action !== "seed" && action !== "list") throw new Error("Expected auth QA action: seed or list")

// This executable is the composition root for the development-only QA operation.
// DATABASE_URL opts into the already-migrated shared PostgreSQL database; otherwise PGlite is used.
// @effect-diagnostics strictEffectProvide:off
const program = Effect.scoped(Effect.gen(function* () {
  const environment = yield* Config.string("NODE_ENV").pipe(Config.withDefault("development"))
  if (environment !== "development" && environment !== "test") return yield* Effect.die(new Error("Auth QA commands are development-only"))
  const databaseUrl = yield* Config.option(Config.redacted("DATABASE_URL"))

  if (Option.isSome(databaseUrl)) {
    const context = yield* Layer.build(makePostgresProductionLive("proxus-auth-qa"))
    yield* checkPostgresMigrations(defaultMigrationsFolder).pipe(Effect.provide(context))
    const db = yield* PostgresDrizzle.makeWithDefaults().pipe(Effect.provide(context))
    const repositories = Layer.mergeAll(
      Layer.succeed(UserRepository, makeUserRepositoryDrizzle(db)),
      Layer.succeed(RoleAssignmentsRepository, makeRoleAssignmentsRepositoryDrizzle(db)),
      PasswordsLive,
    )
    const studyPath = yield* resolveAuthQaStudyPathPostgres(db)
    if (action === "seed") {
      yield* seedAuthQa(studyPath).pipe(Effect.provide(repositories))
      return { action, rows: undefined } as const
    }
    return { action, rows: yield* listAuthQa.pipe(Effect.provide(repositories)) } as const
  }

  const context = yield* Layer.build(PgliteDevelopmentLive)
  yield* migratePglite(defaultMigrationsFolder).pipe(Effect.provide(context))
  const db = yield* PgDrizzle.makeWithDefaults().pipe(Effect.provide(context))
  const repositories = Layer.mergeAll(
    Layer.succeed(UserRepository, makeUserRepositoryDrizzle(db)),
    Layer.succeed(RoleAssignmentsRepository, makeRoleAssignmentsRepositoryDrizzle(db)),
    PasswordsLive,
  )
  const studyPath = yield* resolveAuthQaStudyPath(db).pipe(Effect.catchCause(() =>
    seedPgliteStudyCatalog(defaultMigrationsFolder).pipe(
      Effect.provide(context),
      Effect.andThen(resolveAuthQaStudyPath(db)),
      Effect.catchCause(() => Effect.succeed(authQaStudyPath)),
    ),
  ))
  if (action === "seed") {
    yield* seedAuthQa(studyPath).pipe(Effect.provide(repositories))
    return { action, rows: undefined } as const
  }
  return { action, rows: yield* listAuthQa.pipe(Effect.provide(repositories)) } as const
}))

const result = await Effect.runPromise(program)
// Human-facing CLI output lives outside the Effect program and contains only the safe listing DTO.
// @effect-diagnostics globalConsole:off preferSchemaOverJson:off
if (result.action === "seed") console.log("Seeded 5 development QA auth fixtures.")
else console.log(JSON.stringify(result.rows, null, 2))
