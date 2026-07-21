// @effect-diagnostics anyUnknownInErrorContext:off
import { Context, Effect, Layer } from "effect"
import { RunCoordinator, runCoordinatorLayer } from "@proxus/agent-harness/run"
import type { RunClaim } from "@proxus/agent-harness/store"
import { AgentStore } from "@proxus/agent-harness/store"

/** Deployment-specific run resumption is supplied here; the composition root owns only supervision. */
export class WorkerProcessor extends Context.Service<WorkerProcessor, {
  readonly process: (claim: RunClaim) => Effect.Effect<void, unknown>
}>()("@proxus/agent-worker/app/WorkerProcessor") {}

export interface WorkerOptions { readonly ownerId: string; readonly leaseDurationMs?: number; readonly heartbeatIntervalMs?: number; readonly pollIntervalMs?: number }

export const workerLayer = (options: WorkerOptions) => runCoordinatorLayer({
  ownerId: options.ownerId,
  leaseDurationMs: options.leaseDurationMs ?? 30_000,
  heartbeatIntervalMs: options.heartbeatIntervalMs ?? 10_000,
  pollIntervalMs: options.pollIntervalMs ?? 500,
})

/** Scoped interruption stops claims, interrupts processing, releases the lease, then closes the pool. */
export const runWorker = Effect.gen(function*() {
  const coordinator = yield* RunCoordinator
  const processor = yield* WorkerProcessor
  yield* coordinator.recoverOrphans
  return yield* coordinator.run(processor.process)
})

export const composeWorker = <StoreError, ProcessorError>(options: WorkerOptions, store: Layer.Layer<AgentStore, StoreError>, processor: Layer.Layer<WorkerProcessor, ProcessorError>) =>
  Layer.mergeAll(store, processor, workerLayer(options).pipe(Layer.provide(store)))
