import { Schema } from "effect"
import { AccountId } from "../auth/model.js"

const uuidId = (brand: string) => Schema.String.pipe(
  Schema.check(Schema.isUUID(4)),
  Schema.brand(brand),
)

export const ThreadId = uuidId("ThreadId")
export type ThreadId = typeof ThreadId.Type
export const makeThreadId = Schema.decodeUnknownSync(ThreadId)

export const MessageId = uuidId("MessageId")
export type MessageId = typeof MessageId.Type
export const makeMessageId = Schema.decodeUnknownSync(MessageId)

export const AgentRunId = uuidId("AgentRunId")
export type AgentRunId = typeof AgentRunId.Type
export const makeAgentRunId = Schema.decodeUnknownSync(AgentRunId)

export const AgentTurnId = uuidId("AgentTurnId")
export type AgentTurnId = typeof AgentTurnId.Type
export const makeAgentTurnId = Schema.decodeUnknownSync(AgentTurnId)

export const ModelGenerationId = uuidId("ModelGenerationId")
export type ModelGenerationId = typeof ModelGenerationId.Type
export const makeModelGenerationId = Schema.decodeUnknownSync(ModelGenerationId)

export const ToolExecutionId = uuidId("ToolExecutionId")
export type ToolExecutionId = typeof ToolExecutionId.Type

export const MessageRole = Schema.Literals(["user", "assistant", "tool"])
export const MessageStatus = Schema.Literals(["committed", "streaming", "completed", "interrupted", "failed"])
export const AgentRunStatus = Schema.Literals(["queued", "running", "completed", "interrupted", "failed"])

export class ConversationThread extends Schema.Class<ConversationThread>("ConversationThread")({
  id: ThreadId,
  ownerId: AccountId,
  title: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(200))),
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

export class ConversationMessage extends Schema.Class<ConversationMessage>("ConversationMessage")({
  id: MessageId,
  threadId: ThreadId,
  runId: Schema.NullOr(AgentRunId),
  role: MessageRole,
  sequence: Schema.Number.pipe(Schema.check(Schema.isInt()), Schema.check(Schema.isGreaterThan(0))),
  status: MessageStatus,
  text: Schema.NullOr(Schema.String),
  createdAt: Schema.DateTimeUtcFromString,
  completedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
}) {}

export class AgentRun extends Schema.Class<AgentRun>("AgentRun")({
  id: AgentRunId,
  threadId: ThreadId,
  status: AgentRunStatus,
  stopReason: Schema.NullOr(Schema.String),
  createdAt: Schema.DateTimeUtcFromString,
  startedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  finishedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
}) {}
