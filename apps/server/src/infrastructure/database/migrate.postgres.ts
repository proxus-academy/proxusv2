import { Effect, Layer } from "effect"
import {
  PostgresMigrationLive,
  PostgresProductionLive,
} from "./postgres.js"

const MigrationLive = PostgresMigrationLive.pipe(
  Layer.provide(PostgresProductionLive),
)

await Effect.runPromise(Effect.scoped(Layer.build(MigrationLive)))
