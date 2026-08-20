import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { FeatureFlagSnapshotRepository } from "@proxus/backend-domain/feature-flags"
import { PublishedFeatureFlagSnapshot } from "@proxus/shared/feature-flags"
import { Effect, FileSystem, Layer, Schema } from "effect"
import { FeatureFlagSnapshotRepositoryPostgresLive } from "../modules/feature-flags/repository.postgres.layer.js"
import {
  PostgresMigrationCheckLive,
  makePostgresProductionLive,
} from "./postgres.js"

const file = process.argv[2]
if (file === undefined) throw new Error("usage: pnpm db:publish-feature-flags <snapshot.json>")

const program = Effect.gen(function*() {
  const source = yield* (yield* FileSystem.FileSystem).readFileString(file)
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
  Layer.merge(
    PostgresMigrationCheckLive,
    FeatureFlagSnapshotRepositoryPostgresLive,
  ).pipe(Layer.provide(DatabaseLive)),
  NodeFileSystem.layer,
)

await Effect.runPromise(program.pipe(
  // Composition entry point owns migration verification, persistence and filesystem together.
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(PublisherLive),
  Effect.scoped,
))
