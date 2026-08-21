import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/unstable/httpapi"
import { Forbidden } from "../access-control/api.js"
import { SessionAuthorization } from "../auth/middleware.js"
import { AccountId } from "../auth/model.js"
import { AgentRunId, AgentRunStatus, ThreadId } from "../conversations/schema.js"

export class AiOperation extends Schema.Class<AiOperation>("AiOperation")({
  runId: AgentRunId,
  threadId: ThreadId,
  ownerId: AccountId,
  threadTitle: Schema.String,
  status: AgentRunStatus,
  provider: Schema.NullOr(Schema.String),
  model: Schema.NullOr(Schema.String),
  inputTokens: Schema.NullOr(Schema.Number),
  outputTokens: Schema.NullOr(Schema.Number),
  costMicros: Schema.NullOr(Schema.Number),
  durationMillis: Schema.NullOr(Schema.Number),
  stopReason: Schema.NullOr(Schema.String),
  errorCode: Schema.NullOr(Schema.String),
  traceId: Schema.NullOr(Schema.String),
  createdAt: Schema.DateTimeUtcFromString,
}) {}

export class AdminAiOperationsApi extends HttpApiGroup.make("aiOperations")
  .add(HttpApiEndpoint.get("listOperations", "/ai/operations", {
    success: Schema.Array(AiOperation),
    error: [Forbidden, HttpApiError.InternalServerErrorNoContent],
  }))
  .prefix("/admin")
  .middleware(SessionAuthorization) {}
