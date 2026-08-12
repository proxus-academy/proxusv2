import { Context, Data, Effect } from "effect"
import type { ArtifactId, RunId } from "../ids.js"

export type TraceCaptureStatus = "pending" | "stored" | "failed"
export interface AgentTraceRecord {
  readonly traceId: string
  readonly spanId: string
  readonly runId: RunId
  readonly turn: number
  readonly provider: string
  readonly model: string
  readonly status: "started" | "succeeded" | "failed" | "cancelled"
  readonly captureStatus: TraceCaptureStatus
  readonly startedAt: number
  readonly completedAt?: number
  readonly durationMs?: number
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly artifactId?: ArtifactId
  readonly payloadSha256?: string
  readonly payloadBytes?: number
  readonly contentType?: string
  readonly contentEncoding?: "gzip"
  readonly schemaVersion: number
  readonly redactionVersion: number
  readonly expiresAt?: number
  readonly captureErrorCategory?: string
}
export class AgentTraceStoreError extends Data.TaggedError("AgentTraceStoreError")<{ readonly operation: string; readonly cause?: unknown }> {}

export class AgentTraceStore extends Context.Service<AgentTraceStore, {
  readonly upsert: (record: AgentTraceRecord) => Effect.Effect<void, AgentTraceStoreError>
  readonly get: (traceId: string) => Effect.Effect<AgentTraceRecord | undefined, AgentTraceStoreError>
  readonly listByRun: (runId: RunId) => Effect.Effect<ReadonlyArray<AgentTraceRecord>, AgentTraceStoreError>
}>()("@proxus/agent-harness/store/trace-store/AgentTraceStore") {}
