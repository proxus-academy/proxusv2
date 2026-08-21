import { Context, Effect, Stream } from "effect"
import type { ApplicationEvent } from "./catalog.js"

export interface ApplicationEventEnvelope {
  readonly eventId: string
  readonly emittedAt: string
  readonly event: ApplicationEvent
}

/** Write-only seam used by product cases; acceptance is best-effort and in-process. */
export class ApplicationEventPublisher extends Context.Service<ApplicationEventPublisher, {
  readonly publish: (event: ApplicationEvent) => Effect.Effect<void>
}>()("@proxus/backend-domain/modules/application-events/service/ApplicationEventPublisher") {}

/** Read-only seam reserved for projections and composition roots. */
export class ApplicationEventSource extends Context.Service<ApplicationEventSource, {
  readonly events: Stream.Stream<ApplicationEventEnvelope>
}>()("@proxus/backend-domain/modules/application-events/service/ApplicationEventSource") {}
