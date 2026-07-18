import { Effect, Layer } from "effect"
import { AppEventBus } from "../../app-events/bus.js"
import { FeatureFlagSnapshotRepository } from "./repository.js"
import { FeatureFlags } from "./service.js"

export const FeatureFlagsLive = Layer.effect(FeatureFlags, Effect.gen(function*() {
  const repository = yield* FeatureFlagSnapshotRepository
  const events = yield* AppEventBus
  return FeatureFlags.of({
    getActiveSnapshot: Effect.fn("FeatureFlags.getActiveSnapshot")(function*() {
      return (yield* repository.readActive()) ?? { configurationRevision: 0, flags: [] }
    }),
    publishSnapshot: Effect.fn("FeatureFlags.publishSnapshot")(function* (snapshot) {
      yield* repository.publish(snapshot)
      yield* events.publish({ _tag: "FeatureFlagSnapshotPublished", snapshot })
    }),
  })
}))
