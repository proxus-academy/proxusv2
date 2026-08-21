import { RealtimeSource } from "@proxus/backend-domain/realtime"
import { CurrentUser } from "@proxus/shared/auth"
import { PublicApi } from "@proxus/shared/public-api"
import { RealtimeHeartbeat } from "@proxus/shared/realtime"
import { Duration, Effect, Layer, Schedule, Stream } from "effect"
import { HttpEffect, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"

const heartbeat = Stream.fromEffect(
  Effect.sleep(Duration.seconds(15)).pipe(Effect.as({
    id: "heartbeat",
    event: "realtime.heartbeat" as const,
    data: new RealtimeHeartbeat({ version: 1 }),
  })),
).pipe(Stream.repeat(Schedule.forever))

export const PublicRealtimeHandlers = HttpApiBuilder.group(PublicApi, "realtime", Effect.fn(function* (handlers) {
  const realtime = yield* RealtimeSource
  return handlers.handle("subscribe", () => Effect.gen(function*() {
    const current = yield* CurrentUser
    yield* HttpEffect.appendPreResponseHandler((_request, response) => Effect.succeed(
      HttpServerResponse.setHeaders(response, {
        "cache-control": "no-cache, no-store",
        "x-accel-buffering": "no",
      }),
    ))
    const events = realtime.forAccount(current.account.id).pipe(
      Stream.map((delivery) => {
        const event = delivery.event
        switch (event._tag) {
          case "realtime.heartbeat":
            return { id: delivery.eventId, event: event._tag, data: event }
          case "session.refresh-required":
            return { id: delivery.eventId, event: event._tag, data: event }
        }
      }),
    )
    return Stream.merge(events, heartbeat)
  }))
}))
