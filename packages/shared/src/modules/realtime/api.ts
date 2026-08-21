import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { SessionAuthorization } from "../auth/middleware.js"
import { RealtimeHeartbeat, SessionRefreshRequired } from "./events.js"

export const RealtimeHeartbeatSseEvent = Schema.Struct({
  id: Schema.String,
  event: RealtimeHeartbeat.fields._tag,
  data: Schema.fromJsonString(RealtimeHeartbeat),
})

export const SessionRefreshRequiredSseEvent = Schema.Struct({
  id: Schema.String,
  event: SessionRefreshRequired.fields._tag,
  data: Schema.fromJsonString(SessionRefreshRequired),
})

/** Correlates every native SSE event name with exactly one payload schema. */
export const RealtimeSseEvent = Schema.Union([
  RealtimeHeartbeatSseEvent,
  SessionRefreshRequiredSseEvent,
])
export type RealtimeSseEvent = typeof RealtimeSseEvent.Type

export class PublicRealtimeApi extends HttpApiGroup.make("realtime", { topLevel: true })
  .add(HttpApiEndpoint.get("subscribe", "/events", {
    success: HttpApiSchema.StreamSse({ events: RealtimeSseEvent }),
  }))
  .middleware(SessionAuthorization) {}
