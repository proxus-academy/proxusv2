import { SessionRefreshRequired } from "@proxus/shared/realtime"
import { Effect, Layer, Schema, Stream } from "effect"
import { AccountSessionsRevoked } from "../auth/events.js"
import { ApplicationEventSource } from "../application-events/service.js"
import { RealtimePublisher } from "./service.js"

export const RealtimeProjectionLive = Layer.effectDiscard(Effect.gen(function*() {
  const source = yield* ApplicationEventSource
  const realtime = yield* RealtimePublisher
  yield* source.events.pipe(
    Stream.runForEach((envelope) => {
      const event = envelope.event
      if (Schema.is(AccountSessionsRevoked)(event)) {
        return realtime.publishToAccount({
          eventId: envelope.eventId,
          accountId: event.accountId,
          event: new SessionRefreshRequired({ version: 1 }),
        })
      }
      return Effect.void
    }),
    Effect.forkScoped,
  )
}))
