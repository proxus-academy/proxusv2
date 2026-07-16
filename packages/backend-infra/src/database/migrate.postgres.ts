import { Effect, Layer } from "effect"
import {
  PostgresMigrationLive,
  makePostgresProductionLive,
} from "./postgres.js"

const MigrationLive = PostgresMigrationLive.pipe(
  Layer.provide(makePostgresProductionLive("proxus-database-migration")),
)

await Effect.runPromise(Effect.scoped(Layer.build(MigrationLive)))
