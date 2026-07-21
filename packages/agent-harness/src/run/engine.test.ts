// @effect-diagnostics asyncFunction:off
import { describe, expect, it } from "vitest"
import { Effect, Fiber, Layer } from "effect"
import { OneTurnModel, ModelTurnFailure, scriptedModelLayer, type ScriptedTurn } from "../ai/model-turn.js"
import { makeRunId } from "../ids.js"
import { AgentStore } from "../store/agent-store.js"
import { memoryAgentStoreLayer } from "../store/memory.js"
import { RunEngine, runEngineLayer } from "./engine.js"
import type { RunBudgetLimits } from "./model.js"

const id = (suffix: number) => makeRunId(`00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`)
const limits = (overrides: Partial<RunBudgetLimits> = {}): RunBudgetLimits => ({ maxTurns: 5, maxDslExecutions: 5, maxOperations: 5, maxInputTokens: 100, maxOutputTokens: 100, maxOutputBytes: 1000, deadlineMs: 60_000, maxChildren: 2, ...overrides })
const handlers = { loadSkill: () => Effect.succeed("skill"), executeDsl: () => Effect.succeed("dsl") }
const testLayer = (script: ReadonlyArray<ScriptedTurn>) => {
  const dependencies = Layer.merge(memoryAgentStoreLayer, scriptedModelLayer(script, handlers))
  return Layer.provideMerge(runEngineLayer(), dependencies)
}
const start = (runId: ReturnType<typeof id>, runLimits = limits()) => Effect.gen(function*() {
  const engine = yield* RunEngine
  return yield* engine.start({ runId, instructions: "test", input: "hello", limits: runLimits })
})

describe("RunEngine", () => {
  // @effect-diagnostics-next-line asyncFunction:off
  it("continues one turn at a time and commits a deterministic event/checkpoint order", async () => {
    const program = Effect.gen(function*() {
      const run = yield* start(id(1))
      const store = yield* AgentStore
      return { run, events: yield* store.events(run.id), checkpoint: yield* store.checkpoint(run.id) }
    }).pipe(
      // Test entry point owns the complete Layer graph.
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(testLayer([
      { _tag: "Success", text: "working", finishReason: "tool-calls", usage: { inputTokens: 2, outputTokens: 1 } },
      { _tag: "Success", text: "done", finishReason: "stop", usage: { inputTokens: 3, outputTokens: 2 } },
    ])))
    const result = await Effect.runPromise(program)
    expect(result.run.status).toBe("Succeeded")
    expect(result.run.usage).toMatchObject({ turns: 2, inputTokens: 5, outputTokens: 3 })
    expect(result.events.map((event) => event.type)).toEqual(["RunStarted", "TurnStarted", "TurnCompleted", "CheckpointSaved", "TurnStarted", "TurnCompleted", "RunCompleted", "CheckpointSaved"])
    expect(result.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(result.checkpoint).toMatchObject({ throughSequence: 8, status: "Succeeded", usage: { turns: 2 } })
  })

  it.each([
    ["turns", limits({ maxTurns: 1 }), [{ _tag: "Success", text: "again", finishReason: "continue" }] as ReadonlyArray<ScriptedTurn>],
    ["dslExecutions", limits({ maxDslExecutions: 1 }), [{ _tag: "Success", text: "x", toolCalls: [{ name: "executeDsl", input: { source: "x" } }, { name: "executeDsl", input: { source: "y" } }] }] as ReadonlyArray<ScriptedTurn>],
    ["operations", limits({ maxOperations: 1 }), [{ _tag: "Success", text: "x", toolCalls: [{ name: "loadSkill", input: { name: "a" } }, { name: "loadSkill", input: { name: "b" } }] }] as ReadonlyArray<ScriptedTurn>],
    ["inputTokens", limits({ maxInputTokens: 1 }), [{ _tag: "Success", text: "x", usage: { inputTokens: 2 } }] as ReadonlyArray<ScriptedTurn>],
    ["outputTokens", limits({ maxOutputTokens: 1 }), [{ _tag: "Success", text: "x", usage: { outputTokens: 2 } }] as ReadonlyArray<ScriptedTurn>],
    ["outputBytes", limits({ maxOutputBytes: 1 }), [{ _tag: "Success", text: "é" }] as ReadonlyArray<ScriptedTurn>],
  ])("exhausts the %s budget deterministically", async (name, runLimits, script) => {
    const run = await Effect.runPromise(start(id(10 + String(name).length), runLimits).pipe(
      // Test entry point owns the complete Layer graph.
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(testLayer(script))))
    expect(run.status).toBe("BudgetExhausted")
    expect(run.failure).toBe(name)
  })

  // @effect-diagnostics-next-line asyncFunction:off
  it("times out before invoking a turn", async () => {
    const run = await Effect.runPromise(start(id(30), limits({ deadlineMs: 0 })).pipe(
      // Test entry point owns the complete Layer graph.
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(testLayer([]))))
    expect(run.status).toBe("TimedOut")
  })

  // @effect-diagnostics-next-line asyncFunction:off
  it("persists model failures and a reconstructable terminal checkpoint", async () => {
    const program = Effect.gen(function*() { const run = yield* start(id(31)); const store = yield* AgentStore; return { run, events: yield* store.events(run.id), checkpoint: yield* store.checkpoint(run.id) } }).pipe(
      // Test entry point owns the complete Layer graph.
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(testLayer([{ _tag: "Failure", message: "provider down" }])))
    const result = await Effect.runPromise(program)
    expect(result.run.status).toBe("Failed")
    expect(result.events.map((event) => event.type)).toEqual(["RunStarted", "TurnStarted", "RunFailed"])
    expect(result.checkpoint).toMatchObject({ throughSequence: 3, status: "Failed" })
  })

  // @effect-diagnostics-next-line asyncFunction:off
  it("suspends and resumes only at a persisted turn boundary", async () => {
    const program = Effect.gen(function*() { const engine = yield* RunEngine; const first = yield* engine.start({ runId: id(32), instructions: "test", input: "hello", limits: limits() }); const second = yield* engine.resume(first.id, "test"); return { first, second } }).pipe(
      // Test entry point owns the complete Layer graph.
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(testLayer([{ _tag: "Success", text: "approval", finishReason: "suspend" }, { _tag: "Success", text: "done", finishReason: "stop" }])))
    const { first, second } = await Effect.runPromise(program)
    expect(first.status).toBe("Suspended")
    expect(second.status).toBe("Succeeded")
  })

  // @effect-diagnostics-next-line asyncFunction:off
  it("interrupts an in-flight turn when durable cancellation is requested", async () => {
    const model = Layer.succeed(OneTurnModel, OneTurnModel.of({ generate: () => Effect.never as Effect.Effect<never, ModelTurnFailure> }))
    const layer = Layer.provideMerge(runEngineLayer(), Layer.merge(memoryAgentStoreLayer, model))
    const program = Effect.gen(function*() {
      const engine = yield* RunEngine
      const fiber = yield* Effect.forkChild(engine.start({ runId: id(33), instructions: "test", input: "hello", limits: limits() }))
      yield* Effect.yieldNow
      yield* engine.cancel(id(33))
      const run = yield* Fiber.join(fiber)
      const events = yield* (yield* AgentStore).events(run.id)
      return { run, events }
    }).pipe(
      // Test entry point owns the complete Layer graph.
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(layer), Effect.scoped)
    const result = await Effect.runPromise(program)
    expect(result.run.status).toBe("Cancelled")
    expect(result.events.map((event) => event.type)).toEqual(["RunStarted", "TurnStarted", "CancellationRequested", "RunCancelled"])
  })
})
