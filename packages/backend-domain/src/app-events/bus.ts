import { Context, Effect, Layer } from "effect"
import type { BackendAppEvent } from "./backend.js"

export interface BackendReaction {
  readonly name: string
  readonly event: BackendAppEvent["_tag"]
  readonly handle: (event: BackendAppEvent) => Effect.Effect<void>
}

export const defineBackendReaction = <Tag extends BackendAppEvent["_tag"]>(reaction: {
  readonly name: string
  readonly event: Tag
  readonly handle: (event: Extract<BackendAppEvent, { readonly _tag: Tag }>) => Effect.Effect<void>
}): BackendReaction => ({
  name: reaction.name,
  event: reaction.event,
  handle: (event) => event._tag === reaction.event
    ? reaction.handle(event as Extract<BackendAppEvent, { readonly _tag: Tag }> )
    : Effect.void,
})

export class BackendReactionRegistry extends Context.Service<BackendReactionRegistry, {
  readonly reactions: ReadonlyArray<BackendReaction>
}>()("@proxus/backend-domain/app-events/bus/BackendReactionRegistry") {}

export class AppEventBus extends Context.Service<AppEventBus, {
  /** Runs matching local reactions after commit. It provides neither durability nor cross-process delivery. */
  readonly publish: (event: BackendAppEvent) => Effect.Effect<void>
}>()("@proxus/backend-domain/app-events/bus/AppEventBus") {}

/**
 * A typed in-process dispatcher, following the reaction runner used by the previous application.
 * Reactions are isolated from each other, while publish waits until all matching reactions finish.
 */
export const AppEventBusLive: Layer.Layer<AppEventBus, never, BackendReactionRegistry> = Layer.effect(
  AppEventBus,
  Effect.gen(function*() {
    const { reactions } = yield* BackendReactionRegistry
    return AppEventBus.of({
      publish: Effect.fn("AppEventBus.publish")((event) => Effect.forEach(
        reactions.filter((reaction) => reaction.event === event._tag),
        (reaction) => reaction.handle(event).pipe(
          Effect.catchCause((cause) => Effect.logError("Backend reaction failed", cause, {
            event: event._tag,
            reaction: reaction.name,
          })),
        ),
        { concurrency: 8, discard: true },
      )),
    })
  }),
)
