import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/unstable/httpapi"

export const AgentRunId = Schema.String.pipe(Schema.check(Schema.isUUID(4)))
export const AgentRunStatus = Schema.Literals(["Queued", "Running", "Suspended", "Succeeded", "Failed", "Cancelled", "TimedOut", "BudgetExhausted"])
const Usage = Schema.Struct({ turns: Schema.Number, dslExecutions: Schema.Number, operations: Schema.Number, inputTokens: Schema.Number, outputTokens: Schema.Number, outputBytes: Schema.Number })
const Limits = Schema.Struct({ maxTurns: Schema.Number, maxDslExecutions: Schema.Number, maxOperations: Schema.Number, maxInputTokens: Schema.Number, maxOutputTokens: Schema.Number, maxOutputBytes: Schema.Number, deadlineMs: Schema.Number, maxChildren: Schema.Number })
export const AgentRunListItem = Schema.Struct({ runId: AgentRunId, status: AgentRunStatus, startedAt: Schema.Number, parentRunId: Schema.optional(AgentRunId), turns: Schema.Number, inputTokens: Schema.Number, outputTokens: Schema.Number })
export const AgentTraceMetadata = Schema.Struct({
  traceId: Schema.String, spanId: Schema.String, runId: AgentRunId, turn: Schema.Number, provider: Schema.String, model: Schema.String,
  status: Schema.Literals(["started", "succeeded", "failed", "cancelled"]), captureStatus: Schema.Literals(["pending", "stored", "failed"]), startedAt: Schema.Number,
  completedAt: Schema.optional(Schema.Number), durationMs: Schema.optional(Schema.Number), inputTokens: Schema.optional(Schema.Number), outputTokens: Schema.optional(Schema.Number),
  artifactId: Schema.optional(Schema.String), payloadSha256: Schema.optional(Schema.String), payloadBytes: Schema.optional(Schema.Number), contentType: Schema.optional(Schema.String), contentEncoding: Schema.optional(Schema.Literal("gzip")),
  schemaVersion: Schema.Number, redactionVersion: Schema.Number, expiresAt: Schema.optional(Schema.Number), captureErrorCategory: Schema.optional(Schema.String),
})
const JournalSummary = Schema.Struct({ sequence: Schema.Number, type: Schema.String, at: Schema.Number, turn: Schema.optional(Schema.Number), childRunId: Schema.optional(AgentRunId), parentRunId: Schema.optional(AgentRunId), parentStepId: Schema.optional(Schema.String) })
export const AgentRunDetail = Schema.Struct({ run: AgentRunListItem, limits: Limits, usage: Usage, events: Schema.Array(JournalSummary), traces: Schema.Array(AgentTraceMetadata) })
export const AgentTracePayload = Schema.Struct({ contentType: Schema.String, contentEncoding: Schema.optional(Schema.String), bytesBase64: Schema.String })

const readErrors = [HttpApiError.NotFoundNoContent, HttpApiError.InternalServerErrorNoContent] as const
export class AdminAgentRunsApi extends HttpApiGroup.make("adminAgentRuns").add(
  HttpApiEndpoint.get("listRuns", "/", { query: { limit: Schema.optional(Schema.NumberFromString), before: Schema.optional(Schema.NumberFromString) }, success: Schema.Array(AgentRunListItem), error: HttpApiError.InternalServerErrorNoContent }),
  HttpApiEndpoint.get("getRun", "/:runId", { params: { runId: AgentRunId }, success: AgentRunDetail, error: readErrors }),
  HttpApiEndpoint.get("listTraces", "/:runId/traces", { params: { runId: AgentRunId }, success: Schema.Array(AgentTraceMetadata), error: readErrors }),
  HttpApiEndpoint.get("getTracePayload", "/:runId/traces/:traceId/payload", { params: { runId: AgentRunId, traceId: Schema.String }, success: AgentTracePayload, error: readErrors }),
).prefix("/admin/agent-runs") {}
