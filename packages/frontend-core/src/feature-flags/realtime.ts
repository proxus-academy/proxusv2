import type { FeatureFlagSnapshot } from "@proxus/shared/feature-flags"
import type { PublicRealtimeEvent } from "@proxus/shared/realtime"
import { Cause, Context, Duration, Effect, Layer, Schedule, Stream } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"

export class FeatureFlagSnapshotClient extends Context.Service<FeatureFlagSnapshotClient, {
  readonly getSnapshot: Effect.Effect<FeatureFlagSnapshot, Error>
}>()("@proxus/frontend-core/feature-flags/realtime/FeatureFlagSnapshotClient") {}

export class PublicRealtimeClient extends Context.Service<PublicRealtimeClient, {
  /** One connection attempt. Completion or failure is handled by the supervisor. */
  readonly events: Stream.Stream<PublicRealtimeEvent, Error>
}>()("@proxus/frontend-core/feature-flags/realtime/PublicRealtimeClient") {}

export interface FeatureFlagRealtimeOptions {
  readonly reconnectInitial: Duration.Input
  readonly reconnectMaximum: Duration.Input
}

export const defaultFeatureFlagRealtimeOptions: FeatureFlagRealtimeOptions = {
  reconnectInitial: "250 millis",
  reconnectMaximum: "30 seconds",
}

export const makeFeatureFlagRealtimeAtoms = (
  layer: Layer.Layer<FeatureFlagSnapshotClient | PublicRealtimeClient>,
  options: FeatureFlagRealtimeOptions = defaultFeatureFlagRealtimeOptions,
) => {
  const snapshotAtom = Atom.make<AsyncResult.AsyncResult<FeatureFlagSnapshot, Error>>(AsyncResult.initial(true))
  const runtime = Atom.runtime(layer)
  const lifecycleEffectAtom = runtime.atom(Effect.gen(function*() {
    const snapshots = yield* FeatureFlagSnapshotClient
    const realtime = yield* PublicRealtimeClient
    const registry = yield* AtomRegistry.AtomRegistry
    let highestRevision = -1
    const seen = new Set<string>()

    const refetch = snapshots.getSnapshot.pipe(
      Effect.tap((snapshot) => Effect.sync(() => {
        highestRevision = Math.max(highestRevision, snapshot.configurationRevision)
        registry.set(snapshotAtom, AsyncResult.success(snapshot))
      })),
      Effect.catch((error) => Effect.sync(() => registry.set(snapshotAtom, AsyncResult.failure(Cause.fail(error))))),
    )
    const consumeStream = realtime.events.pipe(
      Stream.runForEach((event) => {
        if (event._tag === "RealtimeHeartbeat") return Effect.void
        const key = `${event.eventId}:${event.revision}`
        if (seen.has(key) || event.revision <= highestRevision) return Effect.void
        seen.add(key)
        if (seen.size > 256) seen.delete(seen.values().next().value!)
        return refetch
      }),
    )
    const consume = consumeStream.pipe(
      Effect.matchCauseEffect({
        onFailure: (cause) => Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : refetch.pipe(Effect.andThen(Effect.failCause(cause))),
        onSuccess: () => refetch,
      }),
    )
    const maximumDelay = Duration.fromInputUnsafe(options.reconnectMaximum)
    const reconnect = Schedule.exponential(options.reconnectInitial).pipe(
      Schedule.modifyDelay(({ duration }) => Effect.succeed(Duration.min(duration, maximumDelay))),
    )
    yield* refetch
    yield* consume.pipe(Effect.retry(reconnect))
  }))

  const lifecycleAtom = Atom.make((get) => {
    get.mount(snapshotAtom)
    return get(lifecycleEffectAtom)
  })
  /** Mount once at the application root. AtomRegistry reference-counting deduplicates StrictMode mounts. */
  return { snapshotAtom, lifecycleAtom }
}
