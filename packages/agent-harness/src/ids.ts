import { Schema } from "effect"

const identifier = (brand: string) =>
  Schema.NonEmptyString.pipe(
    Schema.check(Schema.isPattern(/^[a-z][a-z0-9]*(?:[._/-][a-z0-9]+)*$/)),
    Schema.brand(brand),
  )

export const AgentId = identifier("AgentId")
export type AgentId = typeof AgentId.Type
export const makeAgentId = Schema.decodeUnknownSync(AgentId)

export const SkillId = identifier("SkillId")
export type SkillId = typeof SkillId.Type
export const makeSkillId = Schema.decodeUnknownSync(SkillId)

export const ModelProfileId = identifier("ModelProfileId")
export type ModelProfileId = typeof ModelProfileId.Type
export const makeModelProfileId = Schema.decodeUnknownSync(ModelProfileId)

export const DslDefinitionId = identifier("DslDefinitionId")
export type DslDefinitionId = typeof DslDefinitionId.Type
export const makeDslDefinitionId = Schema.decodeUnknownSync(DslDefinitionId)

export const OperationId = identifier("OperationId")
export type OperationId = typeof OperationId.Type
export const makeOperationId = Schema.decodeUnknownSync(OperationId)

export const SandboxId = identifier("SandboxId")
export type SandboxId = typeof SandboxId.Type
export const makeSandboxId = Schema.decodeUnknownSync(SandboxId)

const uuid = (brand: string) =>
  Schema.String.pipe(Schema.check(Schema.isUUID(4)), Schema.brand(brand))

export const SessionId = uuid("SessionId")
export type SessionId = typeof SessionId.Type
export const makeSessionId = Schema.decodeUnknownSync(SessionId)

export const SessionEntryId = uuid("SessionEntryId")
export type SessionEntryId = typeof SessionEntryId.Type
export const makeSessionEntryId = Schema.decodeUnknownSync(SessionEntryId)

export const RunId = uuid("RunId")
export type RunId = typeof RunId.Type
export const makeRunId = Schema.decodeUnknownSync(RunId)

export const JournalEventId = uuid("JournalEventId")
export type JournalEventId = typeof JournalEventId.Type
export const makeJournalEventId = Schema.decodeUnknownSync(JournalEventId)

export const CheckpointId = uuid("CheckpointId")
export type CheckpointId = typeof CheckpointId.Type
export const makeCheckpointId = Schema.decodeUnknownSync(CheckpointId)

export const ArtifactId = uuid("ArtifactId")
export type ArtifactId = typeof ArtifactId.Type
export const makeArtifactId = Schema.decodeUnknownSync(ArtifactId)
