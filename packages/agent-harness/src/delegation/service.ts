import { Clock, Context, Data, Effect, Layer, Semaphore } from "effect"
import type { AgentId, RunId } from "../ids.js"
import { emptyUsage, type RunBudgetLimits, type RunBudgetUsage, type RunRecord } from "../run/model.js"
import type { SandboxHandle } from "../sandbox/contracts.js"
import { AgentStore, type AgentStoreError } from "../store/agent-store.js"
import type { DslDefinition } from "../dsl/definition.js"

export const DELEGATE_OPERATION_ID = "agents.delegate"

/** Creates a fresh immutable graph with delegation removed; skills cannot add it back. */
export const withoutDelegation = <D extends DslDefinition>(definition: D): DslDefinition => Object.freeze({
  ...definition,
  roots: Object.freeze({ ...definition.roots }),
  contexts: Object.freeze(Object.fromEntries(Object.entries(definition.contexts).map(([name, context]) => [name, Object.freeze({
    methods: Object.freeze(Object.fromEntries(Object.entries(context.methods).filter(([, method]) => method.kind !== "operation" || method.id !== DELEGATE_OPERATION_ID))),
  })]))),
})

export interface ChildExecutionInput {
  readonly run: RunRecord
  readonly task: string
  readonly sandbox: SandboxHandle
  readonly dsl: DslDefinition
  readonly actorId: string
  readonly tenantId: string
  readonly skills: ReadonlyArray<string>
  readonly delegatedAuthority: ReadonlyArray<string>
}
export interface ChildExecutionResult {
  readonly text: string
  readonly usage: RunBudgetUsage
  /** Durable internal details; never returned through DelegateResult. */
  readonly detail?: string
}
export class ChildRunExecutor extends Context.Service<ChildRunExecutor, {
  readonly execute: (input: ChildExecutionInput) => Effect.Effect<ChildExecutionResult, Error>
}>()("@proxus/agent-harness/delegation/service/ChildRunExecutor") {}

export interface DelegateInput {
  readonly parentRunId: RunId
  readonly childRunId: RunId
  readonly parentStepId: string
  readonly task: string
  readonly depth: number
  readonly maxDelegationDepth: number
  readonly childLimits: RunBudgetLimits
  readonly sandbox: SandboxHandle
  readonly dsl: DslDefinition
  readonly agentId: AgentId
  readonly actorId: string
  readonly tenantId: string
  readonly skills: ReadonlyArray<string>
  readonly delegatedAuthority: ReadonlyArray<string>
}
export interface DelegateResult { readonly text: string }
export class DelegationRejected extends Data.TaggedError("DelegationRejected")<{ readonly reason: "depth" | "budget" | "children"; readonly message: string }> {}
export class ChildRunFailed extends Data.TaggedError("ChildRunFailed")<{ readonly childRunId: RunId; readonly message: string }> {}

const keys: ReadonlyArray<keyof RunBudgetUsage> = ["turns", "dslExecutions", "operations", "inputTokens", "outputTokens", "outputBytes"]
const reserve = (parent: RunRecord, requested: RunBudgetLimits): RunBudgetLimits | undefined => {
  const available: Record<keyof RunBudgetUsage, number> = {
    turns: Math.max(0, parent.limits.maxTurns - parent.usage.turns),
    dslExecutions: Math.max(0, parent.limits.maxDslExecutions - parent.usage.dslExecutions),
    operations: Math.max(0, parent.limits.maxOperations - parent.usage.operations),
    inputTokens: Math.max(0, parent.limits.maxInputTokens - parent.usage.inputTokens),
    outputTokens: Math.max(0, parent.limits.maxOutputTokens - parent.usage.outputTokens),
    outputBytes: Math.max(0, parent.limits.maxOutputBytes - parent.usage.outputBytes),
  }
  if (available.turns === 0 || available.operations === 0 || available.outputBytes === 0) return undefined
  return { maxTurns: Math.min(requested.maxTurns, available.turns), maxDslExecutions: Math.min(requested.maxDslExecutions, available.dslExecutions), maxOperations: Math.min(requested.maxOperations, available.operations), maxInputTokens: Math.min(requested.maxInputTokens, available.inputTokens), maxOutputTokens: Math.min(requested.maxOutputTokens, available.outputTokens), maxOutputBytes: Math.min(requested.maxOutputBytes, available.outputBytes), deadlineMs: Math.min(requested.deadlineMs, Math.max(1, parent.deadlineAt - parent.startedAt)), maxChildren: 0 }
}
const reconcile = (parent: RunBudgetUsage, child: RunBudgetUsage): RunBudgetUsage => Object.fromEntries(keys.map((key) => [key, parent[key] + child[key]])) as unknown as RunBudgetUsage

export class Delegation extends Context.Service<Delegation, {
  readonly delegate: (input: DelegateInput) => Effect.Effect<DelegateResult, DelegationRejected | ChildRunFailed | AgentStoreError>
}>()("@proxus/agent-harness/delegation/service/Delegation") {}

export const delegationLayer: Layer.Layer<Delegation, never, AgentStore | ChildRunExecutor> = Layer.effect(Delegation, Effect.gen(function*() {
  const store = yield* AgentStore
  const executor = yield* ChildRunExecutor
  const gate = yield* Semaphore.make(1)
  return Delegation.of({ delegate: (input) => Semaphore.withPermit(gate, Effect.gen(function*() {
    if (input.depth >= input.maxDelegationDepth) return yield* new DelegationRejected({ reason: "depth", message: "Maximum delegation depth reached" })
    let parent = yield* store.getRun(input.parentRunId)
    const parentEvents = yield* store.events(parent.id)
    if (parentEvents.filter((event) => event.type === "ChildRunStarted").length >= parent.limits.maxChildren) return yield* new DelegationRejected({ reason: "children", message: "Child run budget exhausted" })
    const limits = reserve(parent, input.childLimits)
    if (limits === undefined) return yield* new DelegationRejected({ reason: "budget", message: "No parent budget remains for a child" })
    const at = yield* Clock.currentTimeMillis
    const child: RunRecord = { id: input.childRunId, parentRunId: parent.id, parentStepId: input.parentStepId, delegationDepth: input.depth + 1, status: "Running", version: 0, startedAt: at, deadlineAt: Math.min(parent.deadlineAt, at + limits.deadlineMs), limits, usage: emptyUsage(), context: [{ role: "user", content: input.task }], cancellationRequested: false }
    yield* store.createRun(child, { type: "ChildRunStarted", at, parentRunId: parent.id, parentStepId: input.parentStepId, childRunId: child.id })
    parent = yield* store.commit(parent.id, { expectedVersion: parent.version, events: [{ type: "ChildRunStarted", at, childRunId: child.id, parentRunId: parent.id, parentStepId: input.parentStepId }] })
    const raced = yield* Effect.raceFirst(
      executor.execute({ run: child, task: input.task, sandbox: input.sandbox, dsl: withoutDelegation(input.dsl), actorId: input.actorId, tenantId: input.tenantId, skills: input.skills, delegatedAuthority: input.delegatedAuthority }).pipe(Effect.map((result) => ({ _tag: "Done" as const, result })), Effect.catch((error) => Effect.succeed({ _tag: "Failed" as const, error }))),
      store.awaitCancellation(parent.id).pipe(Effect.as({ _tag: "Cancelled" as const })),
    )
    const endedAt = yield* Clock.currentTimeMillis
    const currentChild = yield* store.getRun(child.id)
    if (raced._tag === "Cancelled") {
      yield* store.requestCancellation(child.id, endedAt)
      yield* store.commit(child.id, { expectedVersion: currentChild.version + 1, status: "Cancelled", events: [{ type: "RunCancelled", at: endedAt, parentRunId: parent.id, parentStepId: input.parentStepId }], checkpoint: { status: "Cancelled", usage: currentChild.usage, context: currentChild.context } })
      return yield* new ChildRunFailed({ childRunId: child.id, message: "Parent cancelled" })
    }
    if (raced._tag === "Failed") {
      yield* store.commit(child.id, { expectedVersion: currentChild.version, status: "Failed", failure: "child execution failed", events: [{ type: "RunFailed", at: endedAt, detail: String(raced.error), parentRunId: parent.id, parentStepId: input.parentStepId }] })
      return yield* new ChildRunFailed({ childRunId: child.id, message: "Child execution failed" })
    }
    yield* store.commit(child.id, { expectedVersion: currentChild.version, status: "Succeeded", usage: raced.result.usage, output: raced.result.text, events: [{ type: "ChildRunCompleted", at: endedAt, ...(raced.result.detail === undefined ? {} : { detail: raced.result.detail }), parentRunId: parent.id, parentStepId: input.parentStepId }] })
    const latestParent = yield* store.getRun(parent.id)
    yield* store.commit(parent.id, { expectedVersion: latestParent.version, usage: reconcile(latestParent.usage, raced.result.usage), events: [{ type: "ChildRunCompleted", at: endedAt, childRunId: child.id, parentRunId: parent.id, parentStepId: input.parentStepId }] })
    return { text: raced.result.text }
  })) })
}))
