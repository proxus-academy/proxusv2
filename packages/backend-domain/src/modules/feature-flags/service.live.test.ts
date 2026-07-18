import { Effect, Layer, Ref } from "effect"
import { describe, expect, test } from "vitest"
import { AppEventBus } from "../../app-events/bus.js"
import { FeatureFlagSnapshotRepository } from "./repository.js"
import { FeatureFlagsLive } from "./service.live.js"
import { FeatureFlags } from "./service.js"

const snapshot = { configurationRevision: 7, flags: [] } as const

describe("FeatureFlags.publishSnapshot", () => {
  test("publishes the backend event after persistence", () => Effect.runPromise(Effect.gen(function*() {
    const calls = yield* Ref.make<Array<string>>([])
    const repository = Layer.succeed(FeatureFlagSnapshotRepository, FeatureFlagSnapshotRepository.of({
      readActive: () => Effect.succeed(null),
      publish: () => Ref.update(calls, (values) => [...values, "persist"]),
    }))
    const bus = Layer.succeed(AppEventBus, AppEventBus.of({
      publish: (event) => Ref.update(calls, (values) => [
        ...values,
        `event:${event._tag}:${event.snapshot.configurationRevision}`,
      ]),
    }))
    const program = Effect.gen(function*() {
      const featureFlags = yield* FeatureFlags
      yield* featureFlags.publishSnapshot(snapshot)
      expect(yield* Ref.get(calls)).toEqual(["persist", "event:FeatureFlagSnapshotPublished:7"])
    })
    const testLayer = FeatureFlagsLive.pipe(Layer.provide(Layer.merge(repository, bus)))
    // Test entry point provides the complete dependency graph once.
    // @effect-diagnostics-next-line strictEffectProvide:off
    yield* program.pipe(Effect.provide(testLayer))
  })))
})
