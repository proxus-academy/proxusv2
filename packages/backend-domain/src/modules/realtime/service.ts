import type { RealtimeEvent } from "@proxus/shared/realtime"
import { Context, Effect, Stream } from "effect"

export interface RealtimeDelivery {
  readonly eventId: string
  readonly accountId: string
  readonly event: RealtimeEvent
}

export class RealtimePublisher extends Context.Service<RealtimePublisher, {
  readonly publishToAccount: (delivery: RealtimeDelivery) => Effect.Effect<void>
}>()("@proxus/backend-domain/modules/realtime/service/RealtimePublisher") {}

export class RealtimeSource extends Context.Service<RealtimeSource, {
  readonly forAccount: (accountId: string) => Stream.Stream<RealtimeDelivery>
}>()("@proxus/backend-domain/modules/realtime/service/RealtimeSource") {}
