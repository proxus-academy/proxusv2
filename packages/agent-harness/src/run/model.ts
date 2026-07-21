import type { ModelTurnResult } from "../ai/model-turn.js"
import type { RunId, SessionId } from "../ids.js"

export type RunStatus = "Queued" | "Running" | "Suspended" | "Succeeded" | "Failed" | "Cancelled" | "TimedOut" | "BudgetExhausted"
export type TerminalRunStatus = Extract<RunStatus, "Succeeded" | "Failed" | "Cancelled" | "TimedOut" | "BudgetExhausted">

export interface RunBudgetLimits {
  readonly maxTurns: number
  readonly maxDslExecutions: number
  readonly maxOperations: number
  readonly maxInputTokens: number
  readonly maxOutputTokens: number
  readonly maxOutputBytes: number
  readonly deadlineMs: number
  readonly maxChildren: number
}
export interface RunBudgetUsage {
  readonly turns: number
  readonly dslExecutions: number
  readonly operations: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly outputBytes: number
}
export const emptyUsage = (): RunBudgetUsage => ({ turns: 0, dslExecutions: 0, operations: 0, inputTokens: 0, outputTokens: 0, outputBytes: 0 })

export type TurnDecision =
  | { readonly _tag: "Continue" }
  | { readonly _tag: "Suspend"; readonly reason: string }
  | { readonly _tag: "Complete"; readonly output: string }
  | { readonly _tag: "Fail"; readonly message: string }

export interface RunRecord {
  readonly id: RunId
  readonly sessionId?: SessionId
  readonly parentRunId?: RunId
  readonly parentStepId?: string
  readonly delegationDepth?: number
  readonly status: RunStatus
  readonly version: number
  readonly startedAt: number
  readonly deadlineAt: number
  readonly limits: RunBudgetLimits
  readonly usage: RunBudgetUsage
  readonly context: ReadonlyArray<{ readonly role: "user" | "assistant"; readonly content: string }>
  readonly output?: string
  readonly failure?: string
  readonly cancellationRequested: boolean
}

export type JournalEventType = "RunStarted" | "TurnStarted" | "TurnCompleted" | "RunSuspended" | "RunCompleted" | "RunFailed" | "CancellationRequested" | "RunCancelled" | "BudgetExhausted" | "RunTimedOut" | "CheckpointSaved" | "ChildRunStarted" | "ChildRunCompleted"
export interface JournalEvent { readonly sequence: number; readonly type: JournalEventType; readonly at: number; readonly turn?: number; readonly detail?: string; readonly parentRunId?: RunId; readonly parentStepId?: string; readonly childRunId?: RunId }
export interface RunCheckpoint { readonly throughSequence: number; readonly runVersion: number; readonly status: RunStatus; readonly usage: RunBudgetUsage; readonly context: RunRecord["context"] }

export interface TurnEvaluation { readonly result: ModelTurnResult; readonly decision: TurnDecision }
