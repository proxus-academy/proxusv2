import { Clock, Context, Data, Effect, Layer } from "effect"
import { OneTurnModel, type ModelTurnResult } from "../ai/model-turn.js"
import type { RunId } from "../ids.js"
import { AgentStore, type AgentStoreError } from "../store/agent-store.js"
import { emptyUsage, type RunBudgetLimits, type RunBudgetUsage, type RunRecord, type TurnDecision } from "./model.js"

export class RunEngineFailure extends Data.TaggedError("RunEngineFailure")<{ readonly message: string; readonly cause?: unknown }> {}
export interface StartRunInput { readonly runId: RunId; readonly instructions: string; readonly input: string; readonly limits: RunBudgetLimits }

const bytes = (value: string) => {
  let count = 0
  for (const char of value) { const code = char.codePointAt(0)!; count += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4 }
  return count
}
const addUsage = (old: RunBudgetUsage, result: ModelTurnResult): RunBudgetUsage => ({
  turns: old.turns + 1,
  dslExecutions: old.dslExecutions + result.toolCalls.filter((call) => call.name === "executeDsl").length,
  operations: old.operations + result.toolCalls.length,
  inputTokens: old.inputTokens + (result.usage.inputTokens ?? 0),
  outputTokens: old.outputTokens + (result.usage.outputTokens ?? 0),
  outputBytes: old.outputBytes + bytes(result.text) + result.toolCalls.reduce((sum, call) => sum + bytes(call.result), 0),
})
const exceeded = (usage: RunBudgetUsage, limits: RunBudgetLimits): string | undefined =>
  usage.turns > limits.maxTurns ? "turns" : usage.dslExecutions > limits.maxDslExecutions ? "dslExecutions" : usage.operations > limits.maxOperations ? "operations" : usage.inputTokens > limits.maxInputTokens ? "inputTokens" : usage.outputTokens > limits.maxOutputTokens ? "outputTokens" : usage.outputBytes > limits.maxOutputBytes ? "outputBytes" : undefined

export const defaultTurnDecision = (result: ModelTurnResult): TurnDecision =>
  result.finishReason === "suspend" ? { _tag: "Suspend", reason: "model requested suspension" }
    : result.finishReason === "stop" ? { _tag: "Complete", output: result.text }
    : result.finishReason === "fail" ? { _tag: "Fail", message: result.text || "model requested failure" }
    : { _tag: "Continue" }

export class RunEngine extends Context.Service<RunEngine, {
  readonly start: (input: StartRunInput) => Effect.Effect<RunRecord, RunEngineFailure | AgentStoreError>
  readonly resume: (runId: RunId, instructions: string) => Effect.Effect<RunRecord, RunEngineFailure | AgentStoreError>
  readonly cancel: (runId: RunId) => Effect.Effect<void, AgentStoreError>
}>()("@proxus/agent-harness/run/engine/RunEngine") {}

export const runEngineLayer = (decide: (result: ModelTurnResult) => TurnDecision = defaultTurnDecision): Layer.Layer<RunEngine, never, AgentStore | OneTurnModel> => Layer.effect(RunEngine, Effect.gen(function*() {
  const store = yield* AgentStore
  const model = yield* OneTurnModel
  const now = Clock.currentTimeMillis

  const execute = (initial: RunRecord, instructions: string): Effect.Effect<RunRecord, RunEngineFailure | AgentStoreError> => Effect.gen(function*() {
    let run = initial
    while (run.status === "Running") {
      const at = yield* now
      if (run.cancellationRequested) {
        return yield* store.commit(run.id, { expectedVersion: run.version, status: "Cancelled", events: [{ type: "RunCancelled", at }], checkpoint: { status: "Cancelled", usage: run.usage, context: run.context } })
      }
      if (at >= run.deadlineAt) return yield* store.commit(run.id, { expectedVersion: run.version, status: "TimedOut", events: [{ type: "RunTimedOut", at }], checkpoint: { status: "TimedOut", usage: run.usage, context: run.context } })
      if (run.usage.turns >= run.limits.maxTurns) return yield* store.commit(run.id, { expectedVersion: run.version, status: "BudgetExhausted", failure: "turns", events: [{ type: "BudgetExhausted", at, detail: "turns" }], checkpoint: { status: "BudgetExhausted", usage: run.usage, context: run.context } })
      run = yield* store.commit(run.id, { expectedVersion: run.version, events: [{ type: "TurnStarted", at, turn: run.usage.turns + 1 }] })
      const raced = yield* Effect.raceFirst(
        model.generate({ instructions, context: run.context }).pipe(Effect.map((result) => ({ _tag: "Result" as const, result }))),
        store.awaitCancellation(run.id).pipe(Effect.map(() => ({ _tag: "Cancelled" as const }))),
      ).pipe(Effect.catch((cause) => Effect.succeed({ _tag: "Failure" as const, cause })))
      const endedAt = yield* now
      if (raced._tag === "Cancelled") {
        run = yield* store.getRun(run.id)
        return yield* store.commit(run.id, { expectedVersion: run.version, status: "Cancelled", events: [{ type: "RunCancelled", at: endedAt }], checkpoint: { status: "Cancelled", usage: run.usage, context: run.context } })
      }
      if (raced._tag === "Failure") return yield* store.commit(run.id, { expectedVersion: run.version, status: "Failed", failure: "model turn failed", events: [{ type: "RunFailed", at: endedAt, detail: "model turn failed" }], checkpoint: { status: "Failed", usage: run.usage, context: run.context } })
      const usage = addUsage(run.usage, raced.result)
      const context = [...run.context, { role: "assistant" as const, content: raced.result.text }]
      const limit = exceeded(usage, run.limits)
      if (limit !== undefined) return yield* store.commit(run.id, { expectedVersion: run.version, status: "BudgetExhausted", usage, context, failure: limit, events: [{ type: "TurnCompleted", at: endedAt, turn: usage.turns }, { type: "BudgetExhausted", at: endedAt, detail: limit }, { type: "CheckpointSaved", at: endedAt }], checkpoint: { status: "BudgetExhausted", usage, context } })
      const decision = decide(raced.result)
      const terminal = decision._tag !== "Continue"
      const status = decision._tag === "Suspend" ? "Suspended" : decision._tag === "Complete" ? "Succeeded" : decision._tag === "Fail" ? "Failed" : "Running"
      const finalEvent = decision._tag === "Suspend" ? "RunSuspended" : decision._tag === "Complete" ? "RunCompleted" : decision._tag === "Fail" ? "RunFailed" : "CheckpointSaved"
      run = yield* store.commit(run.id, { expectedVersion: run.version, status, usage, context, ...(decision._tag === "Complete" ? { output: decision.output } : {}), ...(decision._tag === "Fail" ? { failure: decision.message } : {}), events: [{ type: "TurnCompleted", at: endedAt, turn: usage.turns }, { type: finalEvent, at: endedAt }, ...(terminal ? [{ type: "CheckpointSaved" as const, at: endedAt }] : [])], checkpoint: { status, usage, context } })
      if (terminal) return run
    }
    return run
  })

  return RunEngine.of({
    start: (input) => Effect.gen(function*() {
      const at = yield* now
      const run: RunRecord = { id: input.runId, status: "Running", version: 0, startedAt: at, deadlineAt: at + input.limits.deadlineMs, limits: input.limits, usage: emptyUsage(), context: [{ role: "user", content: input.input }], cancellationRequested: false }
      yield* store.createRun(run, { type: "RunStarted", at })
      return yield* execute(run, input.instructions)
    }),
    resume: (id, instructions) => Effect.gen(function*() { const old = yield* store.getRun(id); if (old.status !== "Suspended") return old; const run = yield* store.commit(id, { expectedVersion: old.version, status: "Running", events: [] }); return yield* execute(run, instructions) }),
    cancel: (id) => now.pipe(Effect.flatMap((at) => store.requestCancellation(id, at))),
  })
}))
