import { Context, DateTime, Effect, Layer, PubSub, Random, Stream } from "effect"
import type { ApplicationEvent } from "./catalog.js"
import { ApplicationEventPublisher, ApplicationEventSource, type ApplicationEventEnvelope } from "./service.js"

const makeEventId = Effect.gen(function*() {
  const parts = yield* Effect.forEach([0, 1, 2, 3], () => Random.nextInt)
  return parts.map((part) => Math.abs(part).toString(36).padStart(7, "0")).join("")
})

export const makeApplicationEventHubLive = (capacity = 256) => Layer.effectContext(Effect.gen(function*() {
  if (!Number.isSafeInteger(capacity) || capacity <= 0) {
    return yield* Effect.die("Application event capacity must be a positive safe integer")
  }
  const hub = yield* PubSub.dropping<ApplicationEventEnvelope>(capacity)
  yield* Effect.addFinalizer(() => PubSub.shutdown(hub))

  const publisher = ApplicationEventPublisher.of({
    publish: Effect.fn("ApplicationEventPublisher.publish")(function* (event: ApplicationEvent) {
      const accepted = yield* PubSub.publish(hub, {
        eventId: yield* makeEventId,
        emittedAt: DateTime.formatIso(yield* DateTime.now),
        event,
      })
      if (!accepted) yield* Effect.logWarning("Application event dropped", { eventType: event._tag })
    }),
  })
  const source = ApplicationEventSource.of({ events: Stream.fromPubSub(hub) })
  return Context.make(ApplicationEventPublisher, publisher).pipe(
    Context.add(ApplicationEventSource, source),
  )
}))

export const ApplicationEventHubLive = makeApplicationEventHubLive()
