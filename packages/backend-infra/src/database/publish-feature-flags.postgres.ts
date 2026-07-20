// @effect-diagnostics-next-line nodeBuiltinImport:off
import { readFile } from "node:fs/promises"
import { FeatureFlagSnapshotRepository } from "@proxus/backend-domain/feature-flags"
import { PublishedFeatureFlagSnapshot } from "@proxus/shared/feature-flags"
import { Effect, Layer, Schema } from "effect"
import { FeatureFlagSnapshotRepositoryPostgresLive } from "../modules/feature-flags/repository.postgres.layer.js"
import {
  PostgresMigrationCheckLive,
  makePostgresProductionLive,
} from "./postgres.js"

const file = process.argv[2]
if (file === undefined) throw new Error("usage: pnpm db:publish-feature-flags <snapshot.json>")

const program = Effect.gen(function*() {
  const source = yield* Effect.promise(() => readFile(file, "utf8"))
  // Entry-point parsing is immediately validated by the complete wire schema.
  // @effect-diagnostics-next-line preferSchemaOverJson:off
  const snapshot = yield* Schema.decodeUnknownEffect(
    PublishedFeatureFlagSnapshot,
  )(JSON.parse(source))
  yield* (yield* FeatureFlagSnapshotRepository).publish(snapshot)
  yield* Effect.logInfo("Published feature flag snapshot", { revision: snapshot.configurationRevision })
})

const DatabaseLive = makePostgresProductionLive(
  "proxus-feature-flags-publisher",
)
const PublisherLive = Layer.merge(
  PostgresMigrationCheckLive,
  FeatureFlagSnapshotRepositoryPostgresLive,
).pipe(Layer.provide(DatabaseLive))

await Effect.runPromise(program.pipe(
  // Composition entry point owns migration verification and persistence together.
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(PublisherLive),
  Effect.scoped,
))
