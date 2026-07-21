import { Effect, Layer } from "effect"
import { FeatureFlagSnapshotRepository } from "./repository.js"
import { FeatureFlagSnapshotReader } from "./service.js"

export const FeatureFlagSnapshotReaderLive = Layer.effect(
  FeatureFlagSnapshotReader,
  Effect.gen(function*() {
    const repository = yield* FeatureFlagSnapshotRepository
    return FeatureFlagSnapshotReader.of({
      getActiveSnapshot: Effect.fn("FeatureFlagSnapshotReader.getActiveSnapshot")(function*() {
        return (yield* repository.readActive()) ?? { configurationRevision: 0, flags: [] }
      }),
    })
  }),
)
