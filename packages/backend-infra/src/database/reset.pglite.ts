import { Config, Effect, Layer } from "effect"
import { PgliteDevelopmentLive } from "./pglite.js"
import { resetPgliteStudyCatalog } from "./study-catalog.pglite.js"

const program = Effect.scoped(
  Effect.gen(function*() {
    const context = yield* Layer.build(PgliteDevelopmentLive)
    const migrationsFolder = yield* Config.string(
      "DATABASE_MIGRATIONS_DIR",
    ).pipe(Config.withDefault("./drizzle"))
    yield* resetPgliteStudyCatalog(migrationsFolder).pipe(
      Effect.provide(context),
    )
  }),
)

await Effect.runPromise(program)
