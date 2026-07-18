import { Effect, Layer } from "effect"
import { AppEventBus } from "../../app-events/bus.js"
import { FeatureFlagSnapshotRepository } from "./repository.js"
import { FeatureFlagSnapshotPublisher, FeatureFlagSnapshotReader } from "./service.js"

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

export const FeatureFlagSnapshotPublisherLive = Layer.effect(
  FeatureFlagSnapshotPublisher,
  Effect.gen(function*() {
    const repository = yield* FeatureFlagSnapshotRepository
    const events = yield* AppEventBus
    return FeatureFlagSnapshotPublisher.of({
      publishSnapshot: Effect.fn("FeatureFlagSnapshotPublisher.publishSnapshot")(function* (snapshot) {
        yield* repository.publish(snapshot)
        yield* events.publish({ _tag: "FeatureFlagSnapshotPublished", snapshot })
      }),
    })
  }),
)
