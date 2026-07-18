import { Context, Deferred, Effect, Fiber, Layer, Queue, Ref, Scope, Semaphore } from "effect"
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
    ? reaction.handle(event as Extract<BackendAppEvent, { readonly _tag: Tag }>)
    : Effect.void,
})

/** A module-owned contribution. Composition roots merge contributions into one registry. */
export class BackendReactionContributions extends Context.Service<BackendReactionContributions, {
  readonly reactions: ReadonlyArray<BackendReaction>
}>()("@proxus/backend-domain/app-events/bus/BackendReactionContributions") {}

export class BackendReactionRegistry extends Context.Service<BackendReactionRegistry, {
  readonly reactions: ReadonlyArray<BackendReaction>
}>()("@proxus/backend-domain/app-events/bus/BackendReactionRegistry") {}

export const BackendReactionRegistryLive = Layer.effect(
  BackendReactionRegistry,
  Effect.map(BackendReactionContributions, ({ reactions }) => BackendReactionRegistry.of({ reactions })),
)

export class AppEventBus extends Context.Service<AppEventBus, {
  /** Applies bounded backpressure and completes after every matching local reaction was attempted. */
  readonly publish: (event: BackendAppEvent) => Effect.Effect<void>
}>()("@proxus/backend-domain/app-events/bus/AppEventBus") {}

export interface AppEventBusOptions {
  readonly capacity: number
  readonly reactionConcurrency: number
  readonly shutdownTimeoutMs: number
}
export const defaultAppEventBusOptions: AppEventBusOptions = {
  capacity: 64,
  reactionConcurrency: 8,
  shutdownTimeoutMs: 5_000,
}

type Envelope = { readonly event: BackendAppEvent; readonly completed: Deferred.Deferred<void> }

const validOptions = (options: AppEventBusOptions) =>
  Number.isSafeInteger(options.capacity) && options.capacity > 0 &&
  Number.isSafeInteger(options.reactionConcurrency) && options.reactionConcurrency > 0 &&
  Number.isSafeInteger(options.shutdownTimeoutMs) && options.shutdownTimeoutMs > 0

/** Bounded, process-local, best-effort dispatcher. It is not durable and has no replay. */
export const makeAppEventBusLive = (
  options: AppEventBusOptions = defaultAppEventBusOptions,
): Layer.Layer<AppEventBus, never, BackendReactionRegistry> => Layer.effect(
  AppEventBus,
  Effect.gen(function*() {
    if (!validOptions(options)) return yield* Effect.die("Invalid AppEventBus configuration")
    const scope = yield* Scope.Scope
    const { reactions } = yield* BackendReactionRegistry
    const queue = yield* Queue.bounded<Envelope>(options.capacity)
    const accepting = yield* Ref.make(true)
    const pending = yield* Ref.make(0)
    const lifecycle = yield* Semaphore.make(1)

    const dispatch = (envelope: Envelope) => Effect.forEach(
      reactions.filter((reaction) => reaction.event === envelope.event._tag),
      (reaction) => reaction.handle(envelope.event).pipe(
        Effect.catchCause((cause) => Effect.logError("Backend reaction failed", cause, {
          event: envelope.event._tag,
          reaction: reaction.name,
        })),
      ),
      { concurrency: options.reactionConcurrency, discard: true },
    ).pipe(
      Effect.ensuring(Ref.update(pending, (count) => count - 1).pipe(
        Effect.andThen(Deferred.succeed(envelope.completed, undefined)),
      )),
    )

    const workerFiber = yield* Effect.forkScoped(Effect.forever(Queue.take(queue).pipe(Effect.flatMap(dispatch))))
    const awaitDrain = Effect.gen(function*() {
      while ((yield* Ref.get(pending)) > 0) yield* Effect.sleep(1)
    })
    yield* Scope.addFinalizer(scope, Semaphore.withPermit(lifecycle, Ref.set(accepting, false)).pipe(
      Effect.andThen(awaitDrain.pipe(Effect.timeoutOrElse({
        duration: options.shutdownTimeoutMs,
        orElse: () => Ref.get(pending).pipe(Effect.flatMap((lost) =>
          Effect.logWarning("Backend app event shutdown drain timed out", { lost }))),
      }))),
      Effect.andThen(Fiber.interrupt(workerFiber)),
      Effect.andThen(Queue.shutdown(queue)),
      Effect.asVoid,
    ))

    return AppEventBus.of({
      publish: Effect.fn("AppEventBus.publish")(function* (event) {
        const completed = yield* Deferred.make<void>()
        const admitted = yield* Semaphore.withPermit(lifecycle, Effect.gen(function*() {
          if (!(yield* Ref.get(accepting))) return false
          yield* Ref.update(pending, (count) => count + 1)
          return yield* Queue.offer(queue, { event, completed }).pipe(
            Effect.onInterrupt(() => Ref.update(pending, (count) => count - 1)),
          )
        }))
        if (!admitted) return yield* Effect.logWarning("Backend app event rejected after shutdown", { event: event._tag })
        yield* Deferred.await(completed)
      }),
    })
  }),
)

export const AppEventBusLive = makeAppEventBusLive()
