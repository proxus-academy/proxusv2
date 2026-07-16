// @effect-diagnostics-next-line nodeBuiltinImport:off
import { readFile } from "node:fs/promises"
import { FeatureFlagSnapshotRepository } from "@proxus/backend-domain/feature-flags"
import { FeatureFlagSnapshot } from "@proxus/shared/feature-flags"
import { Effect, Layer, Schema } from "effect"
import { FeatureFlagSnapshotRepositoryPostgresLive } from "../modules/feature-flags/repository.postgres.layer.js"
import { makePostgresProductionLive } from "./postgres.js"

const file = process.argv[2]
if (file === undefined) throw new Error("usage: pnpm db:publish-feature-flags <snapshot.json>")

const program = Effect.gen(function*() {
  const source = yield* Effect.promise(() => readFile(file, "utf8"))
  // Entry-point parsing is immediately validated by the complete wire schema.
  // @effect-diagnostics-next-line preferSchemaOverJson:off
  const snapshot = yield* Schema.decodeUnknownEffect(FeatureFlagSnapshot)(JSON.parse(source))
  yield* (yield* FeatureFlagSnapshotRepository).publish(snapshot)
  yield* Effect.logInfo("Published feature flag snapshot", { revision: snapshot.configurationRevision })
})

const DatabaseLive = makePostgresProductionLive("proxus-feature-flags-publisher")
await Effect.runPromise(program.pipe(
  // Composition entry point owns the complete scoped database Layer.
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(FeatureFlagSnapshotRepositoryPostgresLive.pipe(Layer.provide(DatabaseLive))),
  Effect.scoped,
))
