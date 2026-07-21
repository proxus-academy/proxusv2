// @effect-diagnostics asyncFunction:off strictEffectProvide:off
import { describe, expect, it } from "vitest"
import { Effect, Layer } from "effect"
import { makeRunId, makeSessionEntryId, makeSessionId, makeSkillId } from "../ids.js"
import { emptyUsage, type RunRecord } from "../run/model.js"
import { AgentStore } from "../store/agent-store.js"
import { memoryAgentStoreLayer, memoryAgentStoreLayerFromSnapshot } from "../store/memory.js"
import type { Session, SessionEntry, SessionEntryPayload } from "./model.js"
import { Sessions, sessionsLayer } from "./service.js"

const sid = makeSessionId("00000000-0000-4000-8000-000000000001")
const eid = (n: number) => makeSessionEntryId(`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`)
const rid = makeRunId("00000000-0000-4000-8000-000000000099")
const session: Session = { id: sid, version: 0 }
const entry = (id: number, parent: number | null, payload: SessionEntryPayload): SessionEntry => ({ id: eid(id), sessionId: sid, parentEntryId: parent === null ? null : eid(parent), payload })
const layer = Layer.provideMerge(sessionsLayer, memoryAgentStoreLayer)
const run = (): RunRecord => ({ id: rid, sessionId: sid, status: "Running", version: 0, startedAt: 0, deadlineAt: 100, limits: { maxTurns: 1, maxDslExecutions: 1, maxOperations: 1, maxInputTokens: 1, maxOutputTokens: 1, maxOutputBytes: 1, deadlineMs: 100, maxChildren: 1 }, usage: emptyUsage(), context: [], cancellationRequested: false })

const arrangeBranches = Effect.gen(function*() {
  const sessions = yield* Sessions
  yield* sessions.create(session)
  yield* sessions.append(entry(1, null, { type: "Message", role: "user", content: "root" }), 0)
  yield* sessions.append(entry(2, 1, { type: "SkillActivated", skillId: makeSkillId("review"), contentHash: "hash:a" }), 1)
  yield* sessions.append(entry(3, 2, { type: "Message", role: "assistant", content: "main" }), 2)
  yield* sessions.fork(entry(4, 1, { type: "SkillActivated", skillId: makeSkillId("review"), contentHash: "hash:b" }), 3)
  yield* sessions.append(entry(5, 4, { type: "Message", role: "assistant", content: "fork" }), 4)
  return sessions
})

describe("append-only sessions", () => {
  it("appends, forks, switches active leaves, and rejects stale optimistic writers", async () => {
    const program = Effect.gen(function*() {
      const sessions = yield* arrangeBranches
      const fork = yield* sessions.ancestry(sid)
      const switched = yield* sessions.setActiveLeaf(sid, eid(3), 5)
      const main = yield* sessions.ancestry(sid)
      const conflict = yield* sessions.setActiveLeaf(sid, eid(5), 5).pipe(Effect.flip)
      return { fork, switched, main, conflict }
    }).pipe(Effect.provide(layer))
    const result = await Effect.runPromise(program)
    expect(result.fork.map((item) => item.id)).toEqual([eid(1), eid(4), eid(5)])
    expect(result.switched.activeLeafId).toBe(eid(3))
    expect(result.main.map((item) => item.id)).toEqual([eid(1), eid(2), eid(3)])
    expect(result.conflict._tag).toBe("VersionConflict")
  })

  it("reconstructs branch-specific skill hashes and only applies valid ancestry compaction", async () => {
    const program = Effect.gen(function*() {
      const sessions = yield* arrangeBranches
      const forkBefore = yield* sessions.context(sid)
      yield* sessions.setActiveLeaf(sid, eid(3), 5)
      yield* sessions.append(entry(6, 3, { type: "Compaction", summary: "summary of root and main", compactedThroughEntryId: eid(3) }), 6)
      yield* sessions.append(entry(7, 6, { type: "Message", role: "user", content: "after" }), 7)
      const main = yield* sessions.context(sid)
      const fork = yield* sessions.context(sid, eid(5))
      const invalid = yield* sessions.append(entry(8, 5, { type: "Compaction", summary: "invalid cross branch", compactedThroughEntryId: eid(3) }), 8).pipe(Effect.flip)
      return { forkBefore, main, fork, invalid }
    }).pipe(Effect.provide(layer))
    const result = await Effect.runPromise(program)
    expect(result.forkBefore.skillActivations.get(makeSkillId("review"))).toBe("hash:b")
    expect(result.main.skillActivations.get(makeSkillId("review"))).toBe("hash:a")
    expect(result.main.messages).toEqual([{ role: "assistant", content: "summary of root and main" }, { role: "user", content: "after" }])
    expect(result.fork.compaction).toBeUndefined()
    expect(result.fork.messages.at(-1)?.content).toBe("fork")
    expect(result.invalid._tag).toBe("InvalidCompaction")
  })

  it("reconstructs all branches and active context after a memory snapshot restart", async () => {
    const first = Effect.gen(function*() { yield* arrangeBranches; return yield* (yield* AgentStore).snapshot }).pipe(Effect.provide(layer))
    const snapshot = await Effect.runPromise(first)
    const restarted = Layer.provideMerge(sessionsLayer, memoryAgentStoreLayerFromSnapshot(snapshot))
    const result = await Effect.runPromise(Effect.gen(function*() {
      const sessions = yield* Sessions
      return { active: yield* sessions.context(sid), main: yield* sessions.context(sid, eid(3)), state: yield* sessions.get(sid) }
    }).pipe(Effect.provide(restarted)))
    expect(result.state).toMatchObject({ activeLeafId: eid(5), version: 5 })
    expect(result.active.ancestry.map((item) => item.id)).toEqual([eid(1), eid(4), eid(5)])
    expect(result.main.ancestry.map((item) => item.id)).toEqual([eid(1), eid(2), eid(3)])
  })

  it("commits a run transition and session entries atomically on both optimistic versions", async () => {
    const program = Effect.gen(function*() {
      const store = yield* AgentStore
      yield* store.createSession(session)
      yield* store.createRun(run(), { type: "RunStarted", at: 0 })
      const committed = yield* store.commit(rid, { expectedVersion: 0, events: [{ type: "CheckpointSaved", at: 1 }], session: { expectedVersion: 0, entries: [entry(1, null, { type: "Message", role: "user", content: "hello" })], activeLeafId: eid(1) } })
      const failed = yield* store.commit(rid, { expectedVersion: committed.version, events: [], session: { expectedVersion: 0, entries: [entry(2, 1, { type: "Message", role: "assistant", content: "no" })], activeLeafId: eid(2) } }).pipe(Effect.flip)
      return { failed, current: yield* store.getRun(rid), ancestry: yield* store.sessionAncestry(sid) }
    }).pipe(Effect.provide(memoryAgentStoreLayer))
    const result = await Effect.runPromise(program)
    expect(result.failed._tag).toBe("VersionConflict")
    expect(result.current.version).toBe(1)
    expect(result.ancestry.map((item) => item.id)).toEqual([eid(1)])
  })
})
