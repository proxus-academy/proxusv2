import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { SessionAuthorization } from "../auth/middleware.js"
import { RealtimeEventFromJsonString } from "./events.js"

export const RealtimeSseEvent = Schema.Struct({
  id: Schema.String,
  event: Schema.Literal("realtime"),
  data: RealtimeEventFromJsonString,
})
export type RealtimeSseEvent = typeof RealtimeSseEvent.Type

export class PublicRealtimeApi extends HttpApiGroup.make("realtime", { topLevel: true })
  .add(HttpApiEndpoint.get("subscribe", "/events", {
    success: HttpApiSchema.StreamSse({ events: RealtimeSseEvent }),
  }))
  .middleware(SessionAuthorization) {}
