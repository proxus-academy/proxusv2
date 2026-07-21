import { Context, Effect } from "effect"
import type { ArtifactId, RunId } from "../ids.js"
import type { JournalEvent, RunBudgetLimits, RunBudgetUsage, RunRecord, RunStatus } from "../run/model.js"

/** Values accepted by telemetry. Free text is deliberately not representable. */
export type SafeTelemetryValue = string | number | boolean
export interface SafeAgentEvent {
  readonly type: "run.lifecycle" | "turn.lifecycle" | "model.invocation" | "dsl.operation" | "approval.wait" | "sandbox.process" | "child.lifecycle" | "retention.cleanup"
  readonly at: number
  readonly outcome: "started" | "succeeded" | "failed" | "cancelled" | "denied" | "expired"
  readonly operation?: string
  readonly errorCategory?: string
  readonly durationBucket?: "lt100ms" | "lt1s" | "lt10s" | "gte10s"
  readonly annotations?: Readonly<Record<string, SafeTelemetryValue>>
}

export class AgentTelemetry extends Context.Service<AgentTelemetry, {
  readonly emit: (event: SafeAgentEvent) => Effect.Effect<void>
}>()("@proxus/agent-harness/observability/index/AgentTelemetry") {}

export interface InspectorFact {
  readonly type: "objective" | "model" | "skill" | "dsl" | "operation" | "resource" | "file" | "command" | "validation" | "artifact" | "answer"
  readonly value: string
  readonly at: number
  readonly artifactId?: ArtifactId
}
export interface RunInspectorNode {
  readonly runId: RunId
  readonly parentRunId?: RunId
  readonly parentStepId?: string
  readonly status: RunStatus
  readonly startedAt: number
  readonly objective?: string
  readonly model?: string
  readonly skills: ReadonlyArray<string>
  readonly dslExpressions: ReadonlyArray<string>
  readonly operations: ReadonlyArray<string>
  readonly resources: ReadonlyArray<string>
  readonly filesChanged: ReadonlyArray<string>
  readonly commands: ReadonlyArray<string>
  readonly validations: ReadonlyArray<string>
  readonly artifacts: ReadonlyArray<{ readonly id: ArtifactId; readonly label: string }>
  readonly budget: { readonly limits: RunBudgetLimits; readonly usage: RunBudgetUsage }
  readonly finalAnswer?: string
  readonly children: ReadonlyArray<RunInspectorNode>
}
const values = (facts: ReadonlyArray<InspectorFact>, type: InspectorFact["type"]) => facts.filter((fact) => fact.type === type).sort((a, b) => a.at - b.at).map((fact) => fact.value)
const projectNode = (run: RunRecord, allRuns: ReadonlyArray<RunRecord>, facts: ReadonlyMap<RunId, ReadonlyArray<InspectorFact>>): RunInspectorNode => {
  const own = facts.get(run.id) ?? []
  const artifacts = own.filter((fact): fact is InspectorFact & { readonly artifactId: ArtifactId } => fact.type === "artifact" && fact.artifactId !== undefined).map((fact) => ({ id: fact.artifactId, label: fact.value }))
  const children = allRuns.filter((candidate) => candidate.parentRunId === run.id).sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id)).map((child) => projectNode(child, allRuns, facts))
  const objective = values(own, "objective").at(-1)
  const model = values(own, "model").at(-1)
  const finalAnswer = values(own, "answer").at(-1)
  return { runId: run.id, ...(run.parentRunId !== undefined ? { parentRunId: run.parentRunId } : {}), ...(run.parentStepId !== undefined ? { parentStepId: run.parentStepId } : {}), status: run.status, startedAt: run.startedAt, ...(objective === undefined ? {} : { objective }), ...(model === undefined ? {} : { model }), skills: values(own, "skill"), dslExpressions: values(own, "dsl"), operations: values(own, "operation"), resources: values(own, "resource"), filesChanged: values(own, "file"), commands: values(own, "command"), validations: values(own, "validation"), artifacts, budget: { limits: run.limits, usage: run.usage }, ...(finalAnswer === undefined ? {} : { finalAnswer }), children }
}
/** Pure and transport-neutral. It consumes explicitly safe facts, never run context/output. */
export const projectRunInspector = (rootRunId: RunId, runs: ReadonlyArray<RunRecord>, facts: ReadonlyMap<RunId, ReadonlyArray<InspectorFact>>): RunInspectorNode | undefined => {
  const root = runs.find((run) => run.id === rootRunId)
  return root === undefined ? undefined : projectNode(root, runs, facts)
}

export interface RetentionPolicy { readonly artifactsMs: number; readonly journalMs: number; readonly encryptedDebugMs?: number }
export interface RetentionCandidate { readonly kind: "artifact" | "journal" | "encrypted-debug"; readonly id: string; readonly createdAt: number; readonly terminal: boolean }
/** Journal cleanup is terminal-only; active/recoverable run history is never removed. */
export const planRetentionCleanup = (now: number, policy: RetentionPolicy, candidates: ReadonlyArray<RetentionCandidate>) => candidates.filter((item) => item.terminal && item.createdAt + (item.kind === "artifact" ? policy.artifactsMs : item.kind === "journal" ? policy.journalMs : policy.encryptedDebugMs ?? 0) <= now)

/** Only these journal fields may become inspector facts. detail/context/output are intentionally ignored. */
export const safeJournalSummary = (events: ReadonlyArray<JournalEvent>) => events.map(({ sequence, type, at, turn, childRunId, parentRunId, parentStepId }) => ({ sequence, type, at, ...(turn === undefined ? {} : { turn }), ...(childRunId === undefined ? {} : { childRunId }), ...(parentRunId === undefined ? {} : { parentRunId }), ...(parentStepId === undefined ? {} : { parentStepId }) }))
