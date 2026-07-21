// @effect-diagnostics strictEffectProvide:off
import { AgentStore } from "@proxus/agent-harness/store"
import { emptyUsage, type RunRecord } from "@proxus/agent-harness/run"
import { makeRunId, makeSessionEntryId, makeSessionId } from "@proxus/agent-harness/ids"
import { Effect, Fiber, Layer } from "effect"
import { describe, expect, test } from "vitest"

const runId = makeRunId("00000000-0000-4000-8000-000000000001")
const sessionId = makeSessionId("00000000-0000-4000-8000-000000000002")
const entryId = makeSessionEntryId("00000000-0000-4000-8000-000000000003")
const limits = { maxTurns: 2, maxDslExecutions: 2, maxOperations: 2, maxInputTokens: 20, maxOutputTokens: 20, maxOutputBytes: 100, deadlineMs: 1000, maxChildren: 1 }
const freshRun = (): RunRecord => ({ id: runId, sessionId, status: "Queued", version: 0, startedAt: 1, deadlineAt: 1001, limits, usage: emptyUsage(), context: [], cancellationRequested: false })

export const agentStoreContract = <E>(name: string, layer: () => Layer.Layer<AgentStore, E>) => describe(`${name} AgentStore contract`, () => {
  test("orders events, commits checkpoints, branches, conflicts and cancellation", () => Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const store = yield* AgentStore
    yield* store.createSession({ id: sessionId, version: 0 })
    yield* store.createRun(freshRun(), { type: "RunStarted", at: 1 })
    yield* store.appendSessionEntry({ id: entryId, sessionId, parentEntryId: null, runId, payload: { type: "Message", role: "user", content: "hello" } }, 0)
    const updated = yield* store.commit(runId, { expectedVersion: 0, status: "Running", events: [{ type: "TurnStarted", at: 2 }], checkpoint: { status: "Running", usage: emptyUsage(), context: [] } })
    expect(updated.version).toBe(1)
    expect((yield* store.events(runId)).map((event) => event.sequence)).toEqual([1, 2])
    expect((yield* store.checkpoint(runId))?.throughSequence).toBe(2)
    expect((yield* store.sessionAncestry(sessionId)).map((entry) => entry.id)).toEqual([entryId])
    expect((yield* store.commit(runId, { expectedVersion: 0, events: [] }).pipe(Effect.flip))._tag).toBe("VersionConflict")
    const cancellationWait = yield* Effect.forkChild(store.awaitCancellation(runId))
    yield* Effect.sleep("120 millis")
    yield* store.requestCancellation(runId, 3)
    yield* Fiber.join(cancellationWait)
    expect((yield* store.getRun(runId)).cancellationRequested).toBe(true)
    expect((yield* store.replay(0)).map(({ cursor }) => cursor)).toEqual([1, 2, 3])
  }).pipe(Effect.provide(layer())))), 10_000)

  test("serializes claims, fences stale workers and recovers expired leases", () => Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const store = yield* AgentStore
    yield* store.createRun(freshRun(), { type: "RunStarted", at: 1 })
    const first = yield* store.claimNext("worker-a", 10, 10)
    expect(first?.fencingToken).toBe(1)
    expect(yield* store.claimNext("worker-b", 11, 10)).toBeUndefined()
    expect((yield* store.heartbeat(runId, "worker-a", 1, 12, 10)).leaseExpiresAt).toBe(22)
    expect((yield* store.heartbeat(runId, "worker-b", 1, 12, 10).pipe(Effect.flip))._tag).toBe("ClaimLost")
    expect(yield* store.recoverOrphans(23)).toEqual([runId])
    const second = yield* store.claimNext("worker-b", 23, 10)
    expect(second?.fencingToken).toBe(2)
    expect((yield* store.releaseClaim(runId, "worker-a", 1).pipe(Effect.flip))._tag).toBe("ClaimLost")
    yield* store.releaseClaim(runId, "worker-b", 2)
  }).pipe(Effect.provide(layer())))), 10_000)
})
