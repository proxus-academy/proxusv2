import { Schema } from "effect"
import { AgentId, RunId, SessionEntryId, SessionId, SkillId } from "./ids.js"

export class InvalidDefinition extends Schema.TaggedErrorClass<InvalidDefinition>()(
  "InvalidDefinition",
  {
    path: Schema.NonEmptyString,
    message: Schema.NonEmptyString,
  },
) {}

export class AgentNotFound extends Schema.TaggedErrorClass<AgentNotFound>()(
  "AgentNotFound",
  { agentId: AgentId },
) {}

export class SkillNotAllowed extends Schema.TaggedErrorClass<SkillNotAllowed>()(
  "SkillNotAllowed",
  { agentId: AgentId, skillId: SkillId },
) {}

export class SkillNotFound extends Schema.TaggedErrorClass<SkillNotFound>()(
  "SkillNotFound",
  { skillId: SkillId },
) {}

export class SessionNotFound extends Schema.TaggedErrorClass<SessionNotFound>()(
  "SessionNotFound",
  { sessionId: SessionId },
) {}

export class RunNotFound extends Schema.TaggedErrorClass<RunNotFound>()(
  "RunNotFound",
  { runId: RunId },
) {}

export class EntryNotFound extends Schema.TaggedErrorClass<EntryNotFound>()(
  "EntryNotFound",
  { sessionId: SessionId, entryId: SessionEntryId },
) {}

export class EntryAlreadyExists extends Schema.TaggedErrorClass<EntryAlreadyExists>()(
  "EntryAlreadyExists",
  { entryId: SessionEntryId },
) {}

export class InvalidCompaction extends Schema.TaggedErrorClass<InvalidCompaction>()(
  "InvalidCompaction",
  { entryId: SessionEntryId, compactedThroughEntryId: SessionEntryId },
) {}

export class VersionConflict extends Schema.TaggedErrorClass<VersionConflict>()(
  "VersionConflict",
  {
    resource: Schema.Literals(["session", "run"]),
    expectedVersion: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    actualVersion: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  },
) {}

export class ClaimLost extends Schema.TaggedErrorClass<ClaimLost>()(
  "ClaimLost",
  {
    runId: RunId,
    ownerId: Schema.NonEmptyString,
    fencingToken: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  },
) {}

export class MissingRunVariable extends Schema.TaggedErrorClass<MissingRunVariable>()(
  "MissingRunVariable",
  { name: Schema.NonEmptyString },
) {}
