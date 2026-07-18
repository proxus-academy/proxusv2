import { Effect, Layer, Ref } from "effect"
import { describe, expect, test } from "vitest"
import { AppEventBus, AppEventBusLive, BackendReactionRegistry, defineBackendReaction } from "./bus.js"

describe("AppEventBus", () => {
  test("dispatches a static registry and isolates reaction failures", () => Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const observed = yield* Ref.make<ReadonlyArray<number>>([])
    const failing = defineBackendReaction({
      name: "failing",
      event: "FeatureFlagSnapshotPublished",
      handle: () => Effect.die("reaction failed"),
    })
    const succeeding = defineBackendReaction({
      name: "succeeding",
      event: "FeatureFlagSnapshotPublished",
      handle: (event) => Ref.update(observed, (values) => [...values, event.snapshot.configurationRevision]),
    })
    const registry = Layer.succeed(BackendReactionRegistry, BackendReactionRegistry.of({
      reactions: [failing, succeeding],
    }))
    const program = Effect.gen(function*() {
      const bus = yield* AppEventBus
      yield* bus.publish({
        _tag: "FeatureFlagSnapshotPublished",
        snapshot: { configurationRevision: 9, flags: [] },
      })
      expect(yield* Ref.get(observed)).toEqual([9])
    })
    // Test entry point owns the scoped dispatcher Layer for the complete program.
    // @effect-diagnostics-next-line strictEffectProvide:off
    yield* program.pipe(Effect.provide(AppEventBusLive.pipe(Layer.provide(registry))))
  }))))
})
