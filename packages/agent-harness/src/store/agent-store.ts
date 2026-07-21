import { Context, Effect } from "effect"
import type { RunId, SessionEntryId, SessionId } from "../ids.js"
import { ClaimLost, EntryAlreadyExists, EntryNotFound, InvalidCompaction, RunNotFound, SessionNotFound, VersionConflict } from "../errors.js"
import type { JournalEvent, RunCheckpoint, RunRecord, RunStatus } from "../run/model.js"
import type { Session, SessionEntry } from "../session/model.js"

export type AgentStoreError = RunNotFound | SessionNotFound | EntryNotFound | EntryAlreadyExists | InvalidCompaction | VersionConflict | ClaimLost

export interface RunClaim {
  readonly run: RunRecord
  readonly ownerId: string
  /** Monotonically increasing token. Every write by a worker must present it. */
  readonly fencingToken: number
  readonly leaseExpiresAt: number
}

export interface DurableJournalEvent {
  readonly cursor: number
  readonly runId: RunId
  readonly event: JournalEvent
}

export interface AgentStoreSnapshot {
  readonly runs: ReadonlyArray<{ readonly run: RunRecord; readonly events: ReadonlyArray<JournalEvent>; readonly checkpoint: RunCheckpoint | undefined }>
  readonly sessions: ReadonlyArray<{ readonly session: Session; readonly entries: ReadonlyArray<SessionEntry> }>
}
export interface RunCommit {
  readonly expectedVersion: number
  readonly status?: RunStatus
  readonly usage?: RunRecord["usage"]
  readonly context?: RunRecord["context"]
  readonly output?: string
  readonly failure?: string
  readonly cancellationRequested?: boolean
  readonly events: ReadonlyArray<Omit<JournalEvent, "sequence">>
  readonly checkpoint?: Omit<RunCheckpoint, "throughSequence" | "runVersion">
  /** When present, the run transition and session append are one optimistic commit. */
  readonly session?: { readonly expectedVersion: number; readonly entries: ReadonlyArray<SessionEntry>; readonly activeLeafId: SessionEntryId }
}
/** Deep lifecycle seam: each transition, its events, and optional checkpoint commit atomically. */
export class AgentStore extends Context.Service<AgentStore, {
  readonly createRun: (run: RunRecord, event: Omit<JournalEvent, "sequence">) => Effect.Effect<void, AgentStoreError>
  readonly getRun: (runId: RunId) => Effect.Effect<RunRecord, AgentStoreError>
  readonly commit: (runId: RunId, commit: RunCommit) => Effect.Effect<RunRecord, AgentStoreError>
  readonly requestCancellation: (runId: RunId, at: number) => Effect.Effect<void, AgentStoreError>
  readonly awaitCancellation: (runId: RunId) => Effect.Effect<void, AgentStoreError>
  readonly events: (runId: RunId, afterSequence?: number) => Effect.Effect<ReadonlyArray<JournalEvent>, AgentStoreError>
  readonly checkpoint: (runId: RunId) => Effect.Effect<RunCheckpoint | undefined, AgentStoreError>
  /** Claims one queued run or an expired non-terminal run. Implementations serialize contenders. */
  readonly claimNext: (ownerId: string, now: number, leaseDurationMs: number) => Effect.Effect<RunClaim | undefined, AgentStoreError>
  readonly heartbeat: (runId: RunId, ownerId: string, fencingToken: number, now: number, leaseDurationMs: number) => Effect.Effect<RunClaim, AgentStoreError>
  readonly releaseClaim: (runId: RunId, ownerId: string, fencingToken: number) => Effect.Effect<void, AgentStoreError>
  readonly recoverOrphans: (now: number) => Effect.Effect<ReadonlyArray<RunId>, AgentStoreError>
  /** A deployment-wide durable cursor, independent from each run's sequence. */
  readonly replay: (afterCursor: number, limit?: number) => Effect.Effect<ReadonlyArray<DurableJournalEvent>, AgentStoreError>
  readonly createSession: (session: Session) => Effect.Effect<void, AgentStoreError>
  readonly getSession: (sessionId: SessionId) => Effect.Effect<Session, AgentStoreError>
  readonly appendSessionEntry: (entry: SessionEntry, expectedVersion: number) => Effect.Effect<Session, AgentStoreError>
  readonly setActiveLeaf: (sessionId: SessionId, leafId: SessionEntryId, expectedVersion: number) => Effect.Effect<Session, AgentStoreError>
  readonly sessionAncestry: (sessionId: SessionId, leafId?: SessionEntryId) => Effect.Effect<ReadonlyArray<SessionEntry>, AgentStoreError>
  /** Adapter-neutral state export used by deterministic restart tests; it is not a persistence adapter. */
  readonly snapshot: Effect.Effect<AgentStoreSnapshot>
}>()("@proxus/agent-harness/store/agent-store/AgentStore") {}
