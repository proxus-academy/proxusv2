import { Effect, Layer } from "effect"
import {
  PostgresMigrationCheckLive,
  PostgresProductionLive,
} from "./postgres.js"

const CheckLive = PostgresMigrationCheckLive.pipe(
  Layer.provide(PostgresProductionLive),
)

await Effect.runPromise(Effect.scoped(Layer.build(CheckLive)))
