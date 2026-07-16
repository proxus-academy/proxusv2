import { PgliteClient } from "@effect/sql-pglite"
import { Config, Effect, Layer } from "effect"
import { migratePglite } from "./pglite.js"

const PgliteLayer = PgliteClient.layerConfig({
  dataDir: Config.string("PGLITE_DATA_DIR").pipe(
    Config.withDefault("./.data"),
  ),
})

const program = Effect.scoped(
  Effect.gen(function*() {
    const context = yield* Layer.build(PgliteLayer)
    const migrationsFolder = yield* Config.string(
      "DATABASE_MIGRATIONS_DIR",
    ).pipe(Config.withDefault("./drizzle"))
    return yield* migratePglite(migrationsFolder).pipe(
      Effect.provide(context),
    )
  }),
)

await Effect.runPromise(program)
