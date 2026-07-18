import { Effect, Fiber, Layer, Option, Stream } from "effect"
import { describe, expect, test } from "vitest"
import {
  AppEventBus,
  AppEventBusLive,
  BackendReactionRegistry,
  BackendReactionRegistryLive,
} from "@proxus/backend-domain/app-events"
import {
  BackendRealtimeReactionsLive,
  RealtimeEvents,
  RealtimeEventsLive,
} from "./http.js"

const contributions = BackendRealtimeReactionsLive.pipe(Layer.provide(RealtimeEventsLive))
const registry = BackendReactionRegistryLive.pipe(Layer.provide(contributions))
const bus = AppEventBusLive.pipe(Layer.provide(registry))
// Reusing these exact values is part of the test: bus reaction and SSE source share one broker.
const eventSystem = Layer.mergeAll(RealtimeEventsLive, contributions, registry, bus)

describe("backend realtime reaction", () => {
  test("projects a published snapshot to only its public revision", () => Effect.runPromise(Effect.scoped(
    Effect.gen(function*() {
      const realtime = yield* RealtimeEvents
      const reactions = yield* BackendReactionRegistry
      const next = yield* Effect.forkScoped(Stream.runHead(realtime.subscribe))
      yield* Effect.yieldNow
      yield* reactions.reactions[0]!.handle({
        _tag: "FeatureFlagSnapshotPublished",
        snapshot: { configurationRevision: 42, flags: [] },
      })
      const event = yield* Fiber.join(next).pipe(Effect.timeout("1 second"))
      expect(Option.getOrThrow(event)).toEqual({
        _tag: "FeatureFlagSnapshotChanged",
        revision: 42,
      })
    }).pipe(
      // Test entry point owns the complete scoped event graph.
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(eventSystem),
    ),
  )))

  test("publishes through the shared bus instance to the SSE stream and cleans up subscribers", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const realtime = yield* RealtimeEvents
      const appEvents = yield* AppEventBus
      const next = yield* Effect.forkScoped(Stream.runHead(realtime.subscribe))
      yield* Effect.yieldNow
      yield* appEvents.publish({
        _tag: "FeatureFlagSnapshotPublished",
        snapshot: { configurationRevision: 73, flags: [] },
      })
      expect(Option.getOrThrow(yield* Fiber.join(next))).toEqual({
        _tag: "FeatureFlagSnapshotChanged",
        revision: 73,
      })
      const disconnected = yield* Effect.forkScoped(Stream.runDrain(realtime.subscribe))
      yield* Fiber.interrupt(disconnected)
    }).pipe(
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(eventSystem),
    ))))
})
