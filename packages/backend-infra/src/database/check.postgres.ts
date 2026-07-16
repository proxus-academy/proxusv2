import { Effect, Layer } from "effect"
import {
  PostgresMigrationCheckLive,
  makePostgresProductionLive,
} from "./postgres.js"

const CheckLive = PostgresMigrationCheckLive.pipe(
  Layer.provide(makePostgresProductionLive("proxus-database-check")),
)

await Effect.runPromise(Effect.scoped(Layer.build(CheckLive)))
