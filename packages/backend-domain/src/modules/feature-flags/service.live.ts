import { Effect, Layer } from "effect"
import { FeatureFlagSnapshotRepository } from "./repository.js"
import { FeatureFlags } from "./service.js"

export const FeatureFlagsLive = Layer.effect(FeatureFlags, Effect.gen(function*() {
  const repository = yield* FeatureFlagSnapshotRepository
  return FeatureFlags.of({
    getActiveSnapshot: Effect.fn("FeatureFlags.getActiveSnapshot")(function*() {
      return (yield* repository.readActive()) ?? { configurationRevision: 0, flags: [] }
    }),
    publishSnapshot: Effect.fn("FeatureFlags.publishSnapshot")(function* (snapshot) {
      yield* repository.publish(snapshot)
    }),
  })
}))
