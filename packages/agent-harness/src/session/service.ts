import { Context, Effect, Layer } from "effect"
import { EntryNotFound, InvalidCompaction, SessionNotFound, type VersionConflict } from "../errors.js"
import type { RunId, SessionEntryId, SessionId } from "../ids.js"
import { AgentStore } from "../store/agent-store.js"
import type { AgentStoreError } from "../store/agent-store.js"
import type { SkillActivation } from "../skills/service.js"
import type { ReconstructedSessionContext, Session, SessionEntry } from "./model.js"

export type SessionError = AgentStoreError | SessionNotFound | EntryNotFound | InvalidCompaction | VersionConflict

export interface SessionSkillActivationTarget {
  readonly sessionId: SessionId
  readonly entryId: SessionEntryId
  readonly parentEntryId: SessionEntryId | null
  readonly runId?: RunId
  readonly expectedVersion: number
}

/** Adapter for makeHarnessToolHandlers.onSkillActivated; the optimistic append prevents cross-branch leakage. */
export const appendSkillActivation = (sessions: { readonly append: (entry: SessionEntry, expectedVersion: number) => Effect.Effect<Session, SessionError> }, target: SessionSkillActivationTarget) =>
  (activation: SkillActivation): Effect.Effect<void, SessionError> => sessions.append({
    id: target.entryId,
    sessionId: target.sessionId,
    parentEntryId: target.parentEntryId,
    ...(target.runId === undefined ? {} : { runId: target.runId }),
    payload: { type: "SkillActivated", skillId: activation.skillId, contentHash: activation.contentHash },
  }, target.expectedVersion).pipe(Effect.asVoid)

export const reconstructSessionContext = (ancestry: ReadonlyArray<SessionEntry>): ReconstructedSessionContext => {
  const positions = new Map(ancestry.map((entry, index) => [entry.id, index]))
  let compaction: ReconstructedSessionContext["compaction"]
  let retainedStart = 0
  for (let index = 0; index < ancestry.length; index++) {
    const entry = ancestry[index]!
    if (entry.payload.type !== "Compaction") continue
    const through = positions.get(entry.payload.compactedThroughEntryId)
    if (through !== undefined && through < index) {
      compaction = { entryId: entry.id, summary: entry.payload.summary, compactedThroughEntryId: entry.payload.compactedThroughEntryId }
      retainedStart = through + 1
    }
  }
  const retainedEntries = ancestry.slice(retainedStart).filter((entry) => entry.payload.type !== "Compaction")
  const messages: Array<{ role: "user" | "assistant"; content: string }> = []
  if (compaction !== undefined) messages.push({ role: "assistant", content: compaction.summary })
  const skillActivations = new Map()
  for (const entry of ancestry) if (entry.payload.type === "SkillActivated") skillActivations.set(entry.payload.skillId, entry.payload.contentHash)
  for (const entry of retainedEntries) if (entry.payload.type === "Message") messages.push({ role: entry.payload.role, content: entry.payload.content })
  return { leafId: ancestry.at(-1)?.id, ancestry, retainedEntries, messages, skillActivations, compaction }
}

export class Sessions extends Context.Service<Sessions, {
  readonly create: (session: Session) => Effect.Effect<void, AgentStoreError>
  readonly get: (id: SessionId) => Effect.Effect<Session, AgentStoreError>
  readonly append: (entry: SessionEntry, expectedVersion: number) => Effect.Effect<Session, SessionError>
  readonly fork: (entry: SessionEntry, expectedVersion: number) => Effect.Effect<Session, SessionError>
  readonly setActiveLeaf: (sessionId: SessionId, leafId: SessionEntryId, expectedVersion: number) => Effect.Effect<Session, SessionError>
  readonly ancestry: (sessionId: SessionId, leafId?: SessionEntryId) => Effect.Effect<ReadonlyArray<SessionEntry>, SessionError>
  readonly context: (sessionId: SessionId, leafId?: SessionEntryId) => Effect.Effect<ReconstructedSessionContext, SessionError>
}>()("@proxus/agent-harness/session/service/Sessions") {}

export const sessionsLayer = Layer.effect(Sessions, Effect.gen(function*() {
  const store = yield* AgentStore
  const ancestry = (sessionId: SessionId, leafId?: SessionEntryId) => store.sessionAncestry(sessionId, leafId)
  return Sessions.of({
    create: store.createSession,
    get: store.getSession,
    append: (entry, expectedVersion) => store.appendSessionEntry(entry, expectedVersion),
    fork: (entry, expectedVersion) => store.appendSessionEntry(entry, expectedVersion),
    setActiveLeaf: store.setActiveLeaf,
    ancestry,
    context: (sessionId, leafId) => ancestry(sessionId, leafId).pipe(Effect.map(reconstructSessionContext)),
  })
}))
