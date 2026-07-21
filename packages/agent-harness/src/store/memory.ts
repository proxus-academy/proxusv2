import { Deferred, Effect, Layer, Ref } from "effect"
import { ClaimLost, EntryAlreadyExists, EntryNotFound, InvalidCompaction, RunNotFound, SessionNotFound, VersionConflict } from "../errors.js"
import type { RunId, SessionEntryId, SessionId } from "../ids.js"
import type { JournalEvent, RunCheckpoint, RunRecord } from "../run/model.js"
import type { Session, SessionEntry } from "../session/model.js"
import { AgentStore, type AgentStoreError, type AgentStoreSnapshot, type DurableJournalEvent, type RunClaim, type RunCommit } from "./agent-store.js"

interface StoredRun { readonly run: RunRecord; readonly events: ReadonlyArray<JournalEvent>; readonly checkpoint: RunCheckpoint | undefined; readonly cancelled: Deferred.Deferred<void>; readonly claim?: Omit<RunClaim, "run">; readonly nextFencingToken: number }
interface StoredSession { readonly session: Session; readonly entries: ReadonlyMap<SessionEntryId, SessionEntry> }
interface State { readonly runs: ReadonlyMap<RunId, StoredRun>; readonly sessions: ReadonlyMap<SessionId, StoredSession>; readonly journal: ReadonlyArray<DurableJournalEvent> }
export type MemoryAgentStoreSnapshot = AgentStoreSnapshot
type Result<A> = { readonly ok: true; readonly value: A } | { readonly ok: false; readonly error: AgentStoreError }
const ok = <A>(value: A): Result<A> => ({ ok: true, value })
const fail = <A = never>(error: AgentStoreError): Result<A> => ({ ok: false, error })
const fromResult = <A>(result: Result<A>) => result.ok ? Effect.succeed(result.value) : Effect.fail(result.error)

const ancestryResult = (stored: StoredSession, sessionId: SessionId, leafId: SessionEntryId | undefined): Result<ReadonlyArray<SessionEntry>> => {
  if (leafId === undefined) return ok([])
  const reversed: SessionEntry[] = []
  const seen = new Set<SessionEntryId>()
  let current: SessionEntryId | null = leafId
  while (current !== null) {
    if (seen.has(current)) return fail(new EntryNotFound({ sessionId, entryId: current }))
    seen.add(current)
    const entry = stored.entries.get(current)
    if (entry === undefined) return fail(new EntryNotFound({ sessionId, entryId: current }))
    reversed.push(entry)
    current = entry.parentEntryId
  }
  return ok(reversed.reverse())
}

const makeLayer = (snapshot?: MemoryAgentStoreSnapshot) => Layer.effect(AgentStore, Effect.gen(function*() {
  const runs = new Map<RunId, StoredRun>()
  for (const value of snapshot?.runs ?? []) {
    const cancelled = yield* Deferred.make<void>()
    if (value.run.cancellationRequested) yield* Deferred.succeed(cancelled, undefined)
    runs.set(value.run.id, { ...value, cancelled, nextFencingToken: 1 })
  }
  const sessions = new Map<SessionId, StoredSession>((snapshot?.sessions ?? []).map((value) => [value.session.id, { session: value.session, entries: new Map(value.entries.map((entry) => [entry.id, entry])) }]))
  const initialJournal = (snapshot?.runs ?? []).flatMap(({ run, events }) => events.map((event) => ({ runId: run.id, event }))).map((value, index) => ({ ...value, cursor: index + 1 }))
  const state = yield* Ref.make<State>({ runs, sessions, journal: initialJournal })
  const getRunStored = (id: RunId) => Ref.get(state).pipe(Effect.flatMap((all) => {
    const value = all.runs.get(id)
    return value === undefined ? Effect.fail(new RunNotFound({ runId: id })) : Effect.succeed(value)
  }))
  const getSessionStored = (id: SessionId) => Ref.get(state).pipe(Effect.flatMap((all) => {
    const value = all.sessions.get(id)
    return value === undefined ? Effect.fail(new SessionNotFound({ sessionId: id })) : Effect.succeed(value)
  }))

  const updateSession = (all: State, sessionId: SessionId, expectedVersion: number, entries: ReadonlyArray<SessionEntry>, activeLeafId: SessionEntryId): Result<State> => {
    const stored = all.sessions.get(sessionId)
    if (stored === undefined) return fail(new SessionNotFound({ sessionId }))
    if (stored.session.version !== expectedVersion) return fail(new VersionConflict({ resource: "session", expectedVersion, actualVersion: stored.session.version }))
    const nextEntries = new Map(stored.entries)
    for (const entry of entries) {
      if (entry.sessionId !== sessionId) return fail(new EntryNotFound({ sessionId, entryId: entry.id }))
      if (nextEntries.has(entry.id)) return fail(new EntryAlreadyExists({ entryId: entry.id }))
      if (entry.parentEntryId !== null && !nextEntries.has(entry.parentEntryId)) return fail(new EntryNotFound({ sessionId, entryId: entry.parentEntryId }))
      if (entry.payload.type === "Compaction") {
        const compactedThroughEntryId = entry.payload.compactedThroughEntryId
        const parentAncestry = ancestryResult({ session: stored.session, entries: nextEntries }, sessionId, entry.parentEntryId ?? undefined)
        if (!parentAncestry.ok || !parentAncestry.value.some((candidate) => candidate.id === compactedThroughEntryId)) return fail(new InvalidCompaction({ entryId: entry.id, compactedThroughEntryId }))
      }
      nextEntries.set(entry.id, entry)
    }
    if (!nextEntries.has(activeLeafId)) return fail(new EntryNotFound({ sessionId, entryId: activeLeafId }))
    const nextSessions = new Map(all.sessions)
    nextSessions.set(sessionId, { session: { ...stored.session, activeLeafId, version: stored.session.version + 1 }, entries: nextEntries })
    return ok({ ...all, sessions: nextSessions })
  }

  const commit = (runId: RunId, input: RunCommit) => Ref.modify(state, (all): readonly [Result<RunRecord>, State] => {
    const old = all.runs.get(runId)
    if (old === undefined) return [fail(new RunNotFound({ runId })), all]
    if (old.run.version !== input.expectedVersion) return [fail(new VersionConflict({ resource: "run", expectedVersion: input.expectedVersion, actualVersion: old.run.version })), all]
    let nextState = all
    if (input.session !== undefined) {
      const sessionResult = updateSession(all, input.session.entries[0]?.sessionId ?? old.run.sessionId!, input.session.expectedVersion, input.session.entries, input.session.activeLeafId)
      if (!sessionResult.ok) return [sessionResult, all]
      nextState = sessionResult.value
    }
    const events = [...old.events]
    for (const event of input.events) events.push({
      ...(old.run.parentRunId === undefined ? {} : { parentRunId: old.run.parentRunId }),
      ...(old.run.parentStepId === undefined ? {} : { parentStepId: old.run.parentStepId }),
      ...event,
      sequence: events.length + 1,
    })
    const run: RunRecord = { ...old.run, status: input.status ?? old.run.status, usage: input.usage ?? old.run.usage, context: input.context ?? old.run.context, ...(input.output === undefined ? {} : { output: input.output }), ...(input.failure === undefined ? {} : { failure: input.failure }), cancellationRequested: input.cancellationRequested ?? old.run.cancellationRequested, version: old.run.version + 1 }
    const checkpoint = input.checkpoint === undefined ? old.checkpoint : { ...input.checkpoint, throughSequence: events.length, runVersion: run.version }
    const appended = events.slice(old.events.length).map((event, index) => ({ cursor: nextState.journal.length + index + 1, runId, event }))
    const nextRuns = new Map(nextState.runs); nextRuns.set(runId, { ...old, run, events, checkpoint })
    nextState = { ...nextState, runs: nextRuns, journal: [...nextState.journal, ...appended] }
    return [ok(run), nextState]
  }).pipe(Effect.flatMap(fromResult))

  const service = AgentStore.of({
    createRun: (run, event) => Effect.gen(function*() { const cancelled = yield* Deferred.make<void>(); yield* Ref.update(state, (all) => { const next = new Map(all.runs); const journalEvent = { ...event, sequence: 1 }; next.set(run.id, { run: { ...run, context: [...run.context], usage: { ...run.usage } }, events: [journalEvent], checkpoint: undefined, cancelled, nextFencingToken: 1 }); return { ...all, runs: next, journal: [...all.journal, { cursor: all.journal.length + 1, runId: run.id, event: journalEvent }] } }) }),
    getRun: (id) => getRunStored(id).pipe(Effect.map((stored) => stored.run)), commit,
    requestCancellation: (id, at) => Effect.gen(function*() { const old = yield* getRunStored(id); if (old.run.cancellationRequested) return; yield* commit(id, { expectedVersion: old.run.version, cancellationRequested: true, events: [{ type: "CancellationRequested", at }] }); yield* Deferred.succeed(old.cancelled, undefined) }),
    awaitCancellation: (id) => getRunStored(id).pipe(Effect.flatMap((stored) => Deferred.await(stored.cancelled))),
    events: (id, after = 0) => getRunStored(id).pipe(Effect.map((stored) => stored.events.filter((event) => event.sequence > after))),
    checkpoint: (id) => getRunStored(id).pipe(Effect.map((stored) => stored.checkpoint)),
    claimNext: (ownerId, now, leaseDurationMs) => Ref.modify(state, (all): readonly [RunClaim | undefined, State] => {
      const candidate = [...all.runs.values()].find(({ run, claim }) => !["Succeeded", "Failed", "Cancelled", "TimedOut", "BudgetExhausted", "Suspended"].includes(run.status) && (claim === undefined || claim.leaseExpiresAt <= now))
      if (candidate === undefined) return [undefined, all]
      const token = candidate.nextFencingToken
      const claim = { ownerId, fencingToken: token, leaseExpiresAt: now + leaseDurationMs }
      const runs = new Map(all.runs); runs.set(candidate.run.id, { ...candidate, claim, nextFencingToken: token + 1 })
      return [{ run: candidate.run, ...claim }, { ...all, runs }]
    }),
    heartbeat: (id, ownerId, fencingToken, now, leaseDurationMs) => Ref.modify(state, (all): readonly [Result<RunClaim>, State] => {
      const stored = all.runs.get(id)
      if (stored === undefined) return [fail(new RunNotFound({ runId: id })), all]
      if (stored.claim?.ownerId !== ownerId || stored.claim.fencingToken !== fencingToken || stored.claim.leaseExpiresAt <= now) return [fail(new ClaimLost({ runId: id, ownerId, fencingToken })), all]
      const claim = { ...stored.claim, leaseExpiresAt: now + leaseDurationMs }; const runs = new Map(all.runs); runs.set(id, { ...stored, claim })
      return [ok({ run: stored.run, ...claim }), { ...all, runs }]
    }).pipe(Effect.flatMap(fromResult)),
    releaseClaim: (id, ownerId, fencingToken) => Ref.modify(state, (all): readonly [Result<void>, State] => {
      const stored = all.runs.get(id); if (stored === undefined) return [fail(new RunNotFound({ runId: id })), all]
      if (stored.claim?.ownerId !== ownerId || stored.claim.fencingToken !== fencingToken) return [fail(new ClaimLost({ runId: id, ownerId, fencingToken })), all]
      const runs = new Map(all.runs); const { claim: _, ...withoutClaim } = stored; runs.set(id, withoutClaim); return [ok(undefined), { ...all, runs }]
    }).pipe(Effect.flatMap(fromResult)),
    recoverOrphans: (now) => Ref.modify(state, (all) => { const recovered: RunId[] = []; const runs = new Map(all.runs); for (const [id, stored] of runs) if (stored.claim !== undefined && stored.claim.leaseExpiresAt <= now) { const { claim: _, ...withoutClaim } = stored; runs.set(id, withoutClaim); recovered.push(id) } return [recovered, { ...all, runs }] }),
    replay: (after, limit = 100) => Ref.get(state).pipe(Effect.map((all) => all.journal.filter(({ cursor }) => cursor > after).slice(0, limit))),
    createSession: (session) => Ref.update(state, (all) => { const next = new Map(all.sessions); next.set(session.id, { session, entries: new Map() }); return { ...all, sessions: next } }),
    getSession: (id) => getSessionStored(id).pipe(Effect.map((stored) => stored.session)),
    appendSessionEntry: (entry, expectedVersion) => Ref.modify(state, (all): readonly [Result<Session>, State] => { const result = updateSession(all, entry.sessionId, expectedVersion, [entry], entry.id); if (!result.ok) return [result, all]; return [ok(result.value.sessions.get(entry.sessionId)!.session), result.value] }).pipe(Effect.flatMap(fromResult)),
    setActiveLeaf: (sessionId, leafId, expectedVersion) => Ref.modify(state, (all): readonly [Result<Session>, State] => { const stored = all.sessions.get(sessionId); if (stored === undefined) return [fail(new SessionNotFound({ sessionId })), all]; if (stored.session.version !== expectedVersion) return [fail(new VersionConflict({ resource: "session", expectedVersion, actualVersion: stored.session.version })), all]; if (!stored.entries.has(leafId)) return [fail(new EntryNotFound({ sessionId, entryId: leafId })), all]; const session = { ...stored.session, activeLeafId: leafId, version: stored.session.version + 1 }; const next = new Map(all.sessions); next.set(sessionId, { ...stored, session }); return [ok(session), { ...all, sessions: next }] }).pipe(Effect.flatMap(fromResult)),
    sessionAncestry: (sessionId, leafId) => getSessionStored(sessionId).pipe(Effect.flatMap((stored) => fromResult(ancestryResult(stored, sessionId, leafId ?? stored.session.activeLeafId)))),
    snapshot: Ref.get(state).pipe(Effect.map((all) => ({
      runs: [...all.runs.values()].map(({ run, events, checkpoint }) => ({ run, events, checkpoint })),
      sessions: [...all.sessions.values()].map(({ session, entries }) => ({ session, entries: [...entries.values()] })),
    }))),
  })
  return service
}))

export const memoryAgentStoreLayer = makeLayer()
export const memoryAgentStoreLayerFromSnapshot = (snapshot: MemoryAgentStoreSnapshot) => makeLayer(snapshot)
