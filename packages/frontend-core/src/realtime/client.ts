import type { RealtimeEvent } from "@proxus/shared/realtime"
import { Context, Stream } from "effect"

/** Platform-neutral stream; the web adapter owns EventSource and reconnection. */
export class RealtimeClient extends Context.Service<RealtimeClient, {
  readonly events: Stream.Stream<RealtimeEvent>
}>()("@proxus/frontend-core/realtime/client/RealtimeClient") {}
