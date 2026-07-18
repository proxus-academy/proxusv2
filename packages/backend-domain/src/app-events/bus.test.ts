import { Deferred, Effect, Fiber, Layer, Ref } from "effect"
import { describe, expect, test } from "vitest"
import {
  AppEventBus,
  AppEventBusLive,
  BackendReactionRegistry,
  defineBackendReaction,
  makeAppEventBusLive,
} from "./bus.js"

const event = (revision: number) => ({
  _tag: "FeatureFlagSnapshotPublished" as const,
  snapshot: { configurationRevision: revision, flags: [] },
})

const registryLayer = (...reactions: ReadonlyArray<ReturnType<typeof defineBackendReaction>>) =>
  Layer.succeed(BackendReactionRegistry, BackendReactionRegistry.of({ reactions }))

describe("AppEventBus", () => {
  test("dispatches a static registry and observably isolates reaction failures", () => Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const observed = yield* Ref.make<ReadonlyArray<number>>([])
    const registry = registryLayer(
      defineBackendReaction({
        name: "failing",
        event: "FeatureFlagSnapshotPublished",
        handle: () => Effect.die("reaction failed"),
      }),
      defineBackendReaction({
        name: "succeeding",
        event: "FeatureFlagSnapshotPublished",
        handle: (published) => Ref.update(observed, (values) => [...values, published.snapshot.configurationRevision]),
      }),
    )
    yield* Effect.gen(function*() {
      const bus = yield* AppEventBus
      yield* bus.publish(event(9))
      expect(yield* Ref.get(observed)).toEqual([9])
    // Test entry point owns the complete scoped dispatcher graph.
    }).pipe(
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(AppEventBusLive.pipe(Layer.provide(registry))),
    )
  }))))

  test("applies backpressure while a slow consumer occupies the bounded dispatcher", () => Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const release = yield* Deferred.make<void>()
    const started = yield* Ref.make<ReadonlyArray<number>>([])
    const registry = registryLayer(defineBackendReaction({
      name: "slow",
      event: "FeatureFlagSnapshotPublished",
      handle: (published) => Ref.update(started, (values) => [...values, published.snapshot.configurationRevision]).pipe(
        Effect.andThen(Deferred.await(release)),
      ),
    }))
    const program = Effect.gen(function*() {
      const bus = yield* AppEventBus
      const fibers = yield* Effect.forEach([1, 2, 3], (revision) =>
        Effect.forkScoped(bus.publish(event(revision))))
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      expect(yield* Ref.get(started)).toHaveLength(1)
      yield* Deferred.succeed(release, undefined)
      yield* Effect.forEach(fibers, Fiber.join)
      expect(yield* Ref.get(started)).toEqual([1, 2, 3])
    })
    // @effect-diagnostics-next-line strictEffectProvide:off
    yield* program.pipe(Effect.provide(makeAppEventBusLive({
      capacity: 1,
      reactionConcurrency: 1,
      shutdownTimeoutMs: 1_000,
    }).pipe(Layer.provide(registry))))
  }))))

  test("drains admitted events before its scoped shutdown completes", () => Effect.runPromise(Effect.gen(function*() {
    const observed = yield* Ref.make(false)
    const registry = registryLayer(defineBackendReaction({
      name: "drain",
      event: "FeatureFlagSnapshotPublished",
      handle: () => Effect.sleep(10).pipe(Effect.andThen(Ref.set(observed, true))),
    }))
    yield* Effect.scoped(Effect.gen(function*() {
      const bus = yield* AppEventBus
      yield* Effect.forkScoped(bus.publish(event(1)))
      yield* Effect.yieldNow
    }).pipe(
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(makeAppEventBusLive({
        capacity: 1,
        reactionConcurrency: 1,
        shutdownTimeoutMs: 1_000,
      }).pipe(Layer.provide(registry))),
    ))
    expect(yield* Ref.get(observed)).toBe(true)
  })))
})
