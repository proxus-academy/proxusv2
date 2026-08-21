import { Schema } from "effect"
import { AgentRunId, ThreadId } from "./schema.js"

export class ThreadNotFound extends Schema.TaggedErrorClass<ThreadNotFound>()("ThreadNotFound", {
  threadId: ThreadId,
}) {}
export class AgentRunNotFound extends Schema.TaggedErrorClass<AgentRunNotFound>()("AgentRunNotFound", {
  runId: AgentRunId,
}) {}

export class AgentRunInProgress extends Schema.TaggedErrorClass<AgentRunInProgress>()("AgentRunInProgress", {
  threadId: ThreadId,
}) {}
