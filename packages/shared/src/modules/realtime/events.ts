import { Schema } from "effect"

export class RealtimeHeartbeat extends Schema.TaggedClass<RealtimeHeartbeat>()(
  "realtime.heartbeat",
  { version: Schema.Literal(1) },
) {}

export class SessionRefreshRequired extends Schema.TaggedClass<SessionRefreshRequired>()(
  "session.refresh-required",
  { version: Schema.Literal(1) },
) {}

export const RealtimeEvent = Schema.Union([
  RealtimeHeartbeat,
  SessionRefreshRequired,
])
export type RealtimeEvent = typeof RealtimeEvent.Type
export const RealtimeEventFromJsonString = Schema.fromJsonString(RealtimeEvent)

export type RealtimeEventName = RealtimeEvent["_tag"]
