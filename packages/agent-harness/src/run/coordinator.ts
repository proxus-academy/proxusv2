// @effect-diagnostics anyUnknownInErrorContext:off
import { Clock, Context, Effect, Fiber, Layer, Ref, type Scope } from "effect"
import type { RunId } from "../ids.js"
import { AgentStore, type RunClaim } from "../store/agent-store.js"

export interface RunCoordinatorOptions {
  readonly ownerId: string
  readonly leaseDurationMs: number
  readonly heartbeatIntervalMs: number
  readonly pollIntervalMs: number
}

/** Adapter-neutral lease coordinator. The store is the sole fencing authority. */
export class RunCoordinator extends Context.Service<RunCoordinator, {
  readonly claim: Effect.Effect<RunClaim | undefined>
  readonly heartbeat: (claim: RunClaim) => Effect.Effect<RunClaim, unknown>
  readonly release: (claim: RunClaim) => Effect.Effect<void, unknown>
  readonly recoverOrphans: Effect.Effect<ReadonlyArray<RunId>, unknown>
  /** Runs one claimed job at a time. Interruption stops admission and interrupts the active job. */
  readonly run: (process: (claim: RunClaim) => Effect.Effect<void, unknown>) => Effect.Effect<never, never, Scope.Scope>
}>()("@proxus/agent-harness/run/coordinator/RunCoordinator") {}

export const runCoordinatorLayer = (options: RunCoordinatorOptions) => Layer.effect(RunCoordinator, Effect.gen(function*() {
  const store = yield* AgentStore
  const now = Clock.currentTimeMillis
  const claim = now.pipe(Effect.flatMap((at) => store.claimNext(options.ownerId, at, options.leaseDurationMs)), Effect.orDie)
  const heartbeat = (value: RunClaim) => now.pipe(Effect.flatMap((at) => store.heartbeat(value.run.id, options.ownerId, value.fencingToken, at, options.leaseDurationMs)))
  const release = (value: RunClaim) => store.releaseClaim(value.run.id, options.ownerId, value.fencingToken)
  const recoverOrphans = now.pipe(Effect.flatMap(store.recoverOrphans))
  const run = (process: (claim: RunClaim) => Effect.Effect<void, unknown>) => Effect.forever(Effect.gen(function*() {
    const value = yield* claim
    if (value === undefined) { yield* Effect.sleep(options.pollIntervalMs); return }
    const current = yield* Ref.make(value)
    const heartbeatFiber = yield* Effect.forkScoped(Effect.forever(Effect.sleep(options.heartbeatIntervalMs).pipe(Effect.andThen(Ref.get(current)), Effect.flatMap(heartbeat), Effect.flatMap((next) => Ref.set(current, next)))))
    yield* process(value).pipe(Effect.ensuring(Fiber.interrupt(heartbeatFiber)), Effect.ensuring(Ref.get(current).pipe(Effect.flatMap(release), Effect.ignore)), Effect.catch(() => Effect.void))
  }))
  return RunCoordinator.of({ claim, heartbeat, release, recoverOrphans, run })
}))
