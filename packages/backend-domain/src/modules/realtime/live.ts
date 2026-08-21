import { Context, Effect, Layer, PubSub, Stream } from "effect"
import { RealtimePublisher, RealtimeSource, type RealtimeDelivery } from "./service.js"
import { ApplicationEventHubLive } from "../application-events/live.js"
import { RealtimeProjectionLive } from "./projection.js"

export const makeRealtimeHubLive = (capacity = 256) => Layer.effectContext(Effect.gen(function*() {
  if (!Number.isSafeInteger(capacity) || capacity <= 0) {
    return yield* Effect.die("Realtime capacity must be a positive safe integer")
  }
  const hub = yield* PubSub.dropping<RealtimeDelivery>(capacity)
  yield* Effect.addFinalizer(() => PubSub.shutdown(hub))
  const publisher = RealtimePublisher.of({
    publishToAccount: Effect.fn("RealtimePublisher.publishToAccount")(function* (delivery) {
      const accepted = yield* PubSub.publish(hub, delivery)
      if (!accepted) yield* Effect.logWarning("Realtime event dropped", {
        accountId: delivery.accountId,
        eventType: delivery.event._tag,
      })
    }),
  })
  const source = RealtimeSource.of({
    forAccount: (accountId) => Stream.fromPubSub(hub).pipe(
      Stream.filter((delivery) => delivery.accountId === accountId),
    ),
  })
  return Context.make(RealtimePublisher, publisher).pipe(Context.add(RealtimeSource, source))
}))

export const RealtimeHubLive = makeRealtimeHubLive()

const RealtimeHubsLive = Layer.merge(ApplicationEventHubLive, RealtimeHubLive)

/** One memoized in-process graph shared by domain publishers, projections and SSE subscribers. */
export const ApplicationRealtimeLive = Layer.merge(
  RealtimeHubsLive,
  RealtimeProjectionLive.pipe(Layer.provide(RealtimeHubsLive)),
)
