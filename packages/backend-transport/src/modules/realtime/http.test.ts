import { Effect, Fiber, Layer, Option, Stream } from "effect"
import { describe, expect, test } from "vitest"
import { BackendReactionRegistry } from "@proxus/backend-domain/app-events"
import {
  BackendRealtimeReactionsLive,
  RealtimeEvents,
  RealtimeEventsLive,
} from "./http.js"

describe("backend realtime reaction", () => {
  test("projects a published snapshot to only its public revision", () => Effect.runPromise(Effect.scoped(
    Effect.gen(function*() {
      const realtime = yield* RealtimeEvents
      const registry = yield* BackendReactionRegistry
      const next = yield* Effect.forkScoped(Stream.runHead(realtime.subscribe))
      yield* Effect.yieldNow
      yield* registry.reactions[0]!.handle({
        _tag: "FeatureFlagSnapshotPublished",
        snapshot: { configurationRevision: 42, flags: [] },
      })
      const event = yield* Fiber.join(next).pipe(Effect.timeout("1 second"))
      expect(Option.getOrThrow(event)).toEqual({
        _tag: "FeatureFlagSnapshotChanged",
        revision: 42,
      })
    }).pipe(
      // Test entry point owns the PubSub and reaction registry scopes.
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(BackendRealtimeReactionsLive.pipe(Layer.provideMerge(RealtimeEventsLive))),
    ),
  )))
})
