import {
  BackendReactionRegistry,
  defineBackendReaction,
  type FeatureFlagSnapshotPublished,
} from "@proxus/backend-domain/app-events"
import { PublicApi } from "@proxus/shared/public-api"
import { FeatureFlagSnapshotChanged, RealtimeHeartbeat, type PublicRealtimeEvent } from "@proxus/shared/realtime"
import { Context, Effect, Layer, PubSub, Schedule, Stream } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

export class RealtimeEvents extends Context.Service<RealtimeEvents, {
  /** Best-effort process-local publication. Slow subscribers may observe only the newest signals. */
  readonly publish: (event: PublicRealtimeEvent) => Effect.Effect<boolean>
  readonly subscribe: Stream.Stream<PublicRealtimeEvent>
  readonly heartbeatIntervalMs: number
}>()("@proxus/backend-transport/modules/realtime/http/RealtimeEvents") {}

export interface RealtimeOptions {
  readonly capacity: number
  readonly heartbeatIntervalMs: number
}
export const defaultRealtimeOptions: RealtimeOptions = { capacity: 32, heartbeatIntervalMs: 15_000 }

export const makeRealtimeEventsLive = (options: RealtimeOptions = defaultRealtimeOptions) =>
  Layer.effect(RealtimeEvents, Effect.gen(function*() {
    if (!Number.isSafeInteger(options.capacity) || options.capacity <= 0 ||
      !Number.isSafeInteger(options.heartbeatIntervalMs) || options.heartbeatIntervalMs <= 0) {
      return yield* Effect.die("Invalid realtime options")
    }
    const pubsub = yield* PubSub.sliding<PublicRealtimeEvent>(options.capacity)
    yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub))
    return RealtimeEvents.of({
      publish: (event) => PubSub.publish(pubsub, event),
      subscribe: Stream.fromPubSub(pubsub),
      heartbeatIntervalMs: options.heartbeatIntervalMs,
    })
  }))

export const RealtimeEventsLive = makeRealtimeEventsLive()

export const BackendRealtimeReactionsLive = Layer.effect(BackendReactionRegistry, Effect.gen(function*() {
  const realtime = yield* RealtimeEvents
  const featureFlags = defineBackendReaction({
    name: "realtime.feature-flag-snapshot-published",
    event: "FeatureFlagSnapshotPublished",
    handle: Effect.fn("Realtime.FeatureFlagSnapshotPublished")(function* (event: FeatureFlagSnapshotPublished) {
      const accepted = yield* realtime.publish(new FeatureFlagSnapshotChanged({
        revision: event.snapshot.configurationRevision,
      }))
      if (!accepted) yield* Effect.logWarning("Realtime feature flag signal dropped")
    }),
  })
  return BackendReactionRegistry.of({ reactions: [featureFlags] })
}))

export const PublicRealtimeHandlers = HttpApiBuilder.group(PublicApi, "realtime", Effect.fn(function* (handlers) {
  const realtime = yield* RealtimeEvents
  return handlers.handle("events", () => Effect.succeed(Stream.merge(
    realtime.subscribe,
    Stream.fromEffectSchedule(
      Effect.succeed(new RealtimeHeartbeat()),
      Schedule.spaced(realtime.heartbeatIntervalMs),
    ),
  )))
}))
