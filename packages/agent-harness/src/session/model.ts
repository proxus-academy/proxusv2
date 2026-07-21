import { Schema } from "effect"
import { RunId, SessionEntryId, SessionId, SkillId } from "../ids.js"

export const Session = Schema.Struct({
  id: SessionId,
  activeLeafId: Schema.optional(SessionEntryId),
  version: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
export type Session = typeof Session.Type

const MessageEntry = Schema.Struct({ type: Schema.Literal("Message"), role: Schema.Literals(["user", "assistant"]), content: Schema.NonEmptyString })
const SkillActivatedEntry = Schema.Struct({ type: Schema.Literal("SkillActivated"), skillId: SkillId, contentHash: Schema.NonEmptyString })
const CompactionEntry = Schema.Struct({ type: Schema.Literal("Compaction"), summary: Schema.NonEmptyString, compactedThroughEntryId: SessionEntryId })
export const SessionEntryPayload = Schema.Union([MessageEntry, SkillActivatedEntry, CompactionEntry])
export type SessionEntryPayload = typeof SessionEntryPayload.Type

export const SessionEntry = Schema.Struct({
  id: SessionEntryId,
  sessionId: SessionId,
  parentEntryId: Schema.NullOr(SessionEntryId),
  runId: Schema.optional(RunId),
  payload: SessionEntryPayload,
})
export type SessionEntry = typeof SessionEntry.Type

export interface ReconstructedSessionContext {
  readonly leafId: SessionEntryId | undefined
  readonly ancestry: ReadonlyArray<SessionEntry>
  readonly retainedEntries: ReadonlyArray<SessionEntry>
  readonly messages: ReadonlyArray<{ readonly role: "user" | "assistant"; readonly content: string }>
  /** The last activation on the selected ancestry wins. Identical hashes remain idempotent. */
  readonly skillActivations: ReadonlyMap<SkillId, string>
  readonly compaction: { readonly entryId: SessionEntryId; readonly summary: string; readonly compactedThroughEntryId: SessionEntryId } | undefined
}
