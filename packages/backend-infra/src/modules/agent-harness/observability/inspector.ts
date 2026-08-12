// @effect-diagnostics anyUnknownInErrorContext:off preferSchemaOverJson:off
import { AgentInspector, AgentInspectorFailure, safeJournalSummary, type AgentRunListItem } from "@proxus/agent-harness/observability"
import { AgentTraceStore, ArtifactStore } from "@proxus/agent-harness/store"
import type { JournalEvent, RunRecord } from "@proxus/agent-harness/run"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql/SqlClient"

const parse = <A>(value: unknown): A => typeof value === "string" ? JSON.parse(value) as A : value as A
const item = (run: RunRecord): AgentRunListItem => ({ runId: run.id, status: run.status, startedAt: run.startedAt, ...(run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }), turns: run.usage.turns, inputTokens: run.usage.inputTokens, outputTokens: run.usage.outputTokens })
const storage = () => new AgentInspectorFailure({ reason: "storage" })

export const AgentInspectorSqlLive = Layer.effect(AgentInspector, Effect.gen(function*() {
  const sql = yield* SqlClient; const traces = yield* AgentTraceStore; const artifacts = yield* ArtifactStore
  return AgentInspector.of({
    listRuns: (limit, before) => sql<{ record: unknown }>`select record from agent_runs ${before === undefined ? sql`` : sql`where created_at < to_timestamp(${before} / 1000.0)`} order by created_at desc,id desc limit ${Math.min(Math.max(limit, 1), 100)}`.pipe(Effect.map((rows) => rows.map((row) => item(parse<RunRecord>(row.record)))), Effect.mapError(storage)),
    inspectRun: (runId) => Effect.gen(function*() {
      const rows = yield* sql<{ record: unknown }>`select record from agent_runs where id=${runId}`.pipe(Effect.mapError(storage)); if (rows[0] === undefined) return yield* new AgentInspectorFailure({ reason: "not-found" })
      const run = parse<RunRecord>(rows[0].record)
      const events = yield* sql<{ event: unknown }>`select event from agent_journal where run_id=${runId} order by sequence`.pipe(Effect.map((values) => values.map((value) => parse<JournalEvent>(value.event))), Effect.mapError(storage))
      const traceRows = yield* traces.listByRun(runId).pipe(Effect.mapError(storage))
      return { run: item(run), limits: run.limits, usage: run.usage, events: safeJournalSummary(events), traces: traceRows }
    }),
    payload: (runId, traceId) => Effect.gen(function*() {
      const trace = yield* traces.get(traceId).pipe(Effect.mapError(storage)); if (trace === undefined || trace.runId !== runId || trace.artifactId === undefined) return yield* new AgentInspectorFailure({ reason: "payload-unavailable" })
      const bytes = yield* artifacts.get(trace.artifactId, { tenantId: "local", runId, roles: ["reader"] }).pipe(Effect.mapError(storage))
      return { contentType: trace.contentType ?? "application/octet-stream", ...(trace.contentEncoding === undefined ? {} : { contentEncoding: trace.contentEncoding }), bytes }
    }),
  })
}))
