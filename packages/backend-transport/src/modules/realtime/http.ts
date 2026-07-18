import {
  BackendReactionContributions,
  defineBackendReaction,
  type FeatureFlagSnapshotPublished,
} from "@proxus/backend-domain/app-events"
import { PublicApi } from "@proxus/shared/public-api"
import { FeatureFlagSnapshotChanged, RealtimeHeartbeat, type PublicRealtimeEvent } from "@proxus/shared/realtime"
import { Context, Effect, Layer, PubSub, Schedule, Stream } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

/** Replaceable realtime broker port. The memory adapter is process-local and freshness-first. */
export class RealtimeBroker extends Context.Service<RealtimeBroker, {
  readonly publish: (event: PublicRealtimeEvent) => Effect.Effect<boolean>
  readonly subscribe: Stream.Stream<PublicRealtimeEvent>
  readonly heartbeatIntervalMs: number
}>()("@proxus/backend-transport/modules/realtime/http/RealtimeBroker") {}

/** Compatibility alias for existing backend consumers. */
export { RealtimeBroker as RealtimeEvents }

export interface RealtimeOptions {
  readonly capacity: number
  readonly heartbeatIntervalMs: number
}
export const defaultRealtimeOptions: RealtimeOptions = { capacity: 32, heartbeatIntervalMs: 15_000 }

export const makeRealtimeBrokerMemoryLive = (options: RealtimeOptions = defaultRealtimeOptions) =>
  Layer.effect(RealtimeBroker, Effect.gen(function*() {
    if (!Number.isSafeInteger(options.capacity) || options.capacity <= 0 ||
      !Number.isSafeInteger(options.heartbeatIntervalMs) || options.heartbeatIntervalMs <= 0) {
      return yield* Effect.die("Invalid realtime options")
    }
    const pubsub = yield* PubSub.sliding<PublicRealtimeEvent>(options.capacity)
    yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub))
    return RealtimeBroker.of({
      publish: (event) => PubSub.publish(pubsub, event),
      subscribe: Stream.fromPubSub(pubsub),
      heartbeatIntervalMs: options.heartbeatIntervalMs,
    })
  }))

export const makeRealtimeEventsLive = makeRealtimeBrokerMemoryLive
export const RealtimeBrokerMemoryLive = makeRealtimeBrokerMemoryLive()
export const RealtimeEventsLive = RealtimeBrokerMemoryLive

export const BackendRealtimeReactionContributionsLive = Layer.effect(
  BackendReactionContributions,
  Effect.gen(function*() {
    const realtime = yield* RealtimeBroker
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
    return BackendReactionContributions.of({ reactions: [featureFlags] })
  }),
)

/** Compatibility name: this layer now contributes reactions rather than constructing the registry. */
export const BackendRealtimeReactionsLive = BackendRealtimeReactionContributionsLive

export const PublicRealtimeHandlers = HttpApiBuilder.group(PublicApi, "realtime", Effect.fn(function* (handlers) {
  const realtime = yield* RealtimeBroker
  return handlers.handle("events", () => Effect.succeed(Stream.merge(
    realtime.subscribe,
    Stream.fromEffectSchedule(
      Effect.succeed(new RealtimeHeartbeat()),
      Schedule.spaced(realtime.heartbeatIntervalMs),
    ),
  )))
}))
