// @effect-diagnostics strictEffectProvide:off anyUnknownInErrorContext:off
import { AgentStore, memoryAgentStoreLayer } from "@proxus/agent-harness/store"
import { RunCoordinator } from "@proxus/agent-harness/run"
import { Effect, Layer } from "effect"
import { describe, expect, test } from "vitest"
import { composeWorker, WorkerProcessor } from "./app.js"

const processor = Layer.succeed(WorkerProcessor, WorkerProcessor.of({ process: () => Effect.void }))

describe("agent worker composition", () => {
  test("composes one store with coordinator and processor and recovers cleanly", () => Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const store = yield* AgentStore
    const coordinator = yield* RunCoordinator
    expect(yield* coordinator.recoverOrphans).toEqual([])
    expect(yield* store.replay(0)).toEqual([])
  }).pipe(Effect.provide(composeWorker({ ownerId: "worker-test", pollIntervalMs: 1 }, memoryAgentStoreLayer, processor))))))
})
