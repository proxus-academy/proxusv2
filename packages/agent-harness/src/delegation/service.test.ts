// @effect-diagnostics asyncFunction:off strictEffectProvide:off
import { Clock, Deferred, Effect, Fiber, Layer, Ref, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Dsl, compileDsl } from "../dsl/index.js"
import { makeAgentId, makeRunId, makeSandboxId } from "../ids.js"
import { emptyUsage, type RunBudgetLimits, type RunRecord } from "../run/model.js"
import type { SandboxHandle } from "../sandbox/contracts.js"
import { AgentStore } from "../store/agent-store.js"
import { memoryAgentStoreLayer } from "../store/memory.js"
import { ChildRunExecutor, Delegation, DelegationRejected, delegationLayer, withoutDelegation, type ChildExecutionInput, type ChildExecutionResult, type DelegateInput } from "./service.js"

const rid = (n: number) => makeRunId(`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`)
const limits = (overrides: Partial<RunBudgetLimits> = {}): RunBudgetLimits => ({ maxTurns: 10, maxDslExecutions: 10, maxOperations: 10, maxInputTokens: 100, maxOutputTokens: 100, maxOutputBytes: 1000, deadlineMs: 60_000, maxChildren: 4, ...overrides })
const dsl = Dsl.define({ id: "delegation-test", version: 1, roots: { agents: "agents", files: "files" }, contexts: {
  agents: { methods: { delegate: Dsl.operation(Schema.Struct({ task: Schema.String }), Schema.String, { id: "agents.delegate" }) } },
  files: { methods: { inspect: Dsl.operation(Schema.Struct({}), Schema.String, { id: "files.inspect" }) } },
} })

const makeParent = (at: number, usage = emptyUsage()): RunRecord => ({ id: rid(1), status: "Running", version: 0, startedAt: at, deadlineAt: at + 60_000, limits: limits(), usage, context: [], cancellationRequested: false })
const setup = (execute: (input: ChildExecutionInput) => Effect.Effect<ChildExecutionResult, Error>) => Effect.gen(function*() {
  const files = yield* Ref.make(new Map<string, string>())
  const sandbox: SandboxHandle = { id: makeSandboxId("shared"), workspace: "workspace", readText: (path) => Ref.get(files).pipe(Effect.map((all) => all.get(path) ?? "")), writeText: (path, text) => Ref.update(files, (all) => new Map(all).set(path, text)), run: () => Effect.succeed({ exitCode: 0, stdout: "", stderr: "" }) }
  const store = yield* AgentStore
  const at = yield* Clock.currentTimeMillis
  yield* store.createRun(makeParent(at), { type: "RunStarted", at })
  const delegation = yield* Delegation
  const input = (child: number, overrides: Partial<DelegateInput> = {}): DelegateInput => ({ parentRunId: rid(1), childRunId: rid(child), parentStepId: `step-${child}`, task: `task-${child}`, depth: 0, maxDelegationDepth: 1, childLimits: limits(), sandbox, dsl, agentId: makeAgentId("engineering"), actorId: "actor", tenantId: "tenant", skills: ["coding"], delegatedAuthority: ["read", "write"], ...overrides })
  return { files, sandbox, store, delegation, input }
}).pipe(Effect.provide(Layer.merge(
  memoryAgentStoreLayer,
  delegationLayer.pipe(Layer.provide(Layer.merge(memoryAgentStoreLayer, Layer.succeed(ChildRunExecutor, ChildRunExecutor.of({ execute }))))),
)))

const zeroUsage = emptyUsage()

describe("same-sandbox child delegation", () => {
  it("shares edits, inherits context and DSL minus delegation, and returns text only", async () => {
    let observed: ChildExecutionInput | undefined
    const program = Effect.gen(function*() {
      const env = yield* setup((input) => Effect.gen(function*() { observed = input; yield* input.sandbox.writeText("change.txt", "child edit"); return { text: "child summary", usage: { ...zeroUsage, turns: 1, operations: 1 }, detail: "secret command and touched paths" } }))
      const result = yield* env.delegation.delegate(env.input(2))
      const edit = yield* env.sandbox.readText("change.txt")
      const childEvents = yield* env.store.events(rid(2))
      return { result, edit, childEvents }
    })
    const value = await Effect.runPromise(program)
    expect(value.result).toEqual({ text: "child summary" })
    expect(value.edit).toBe("child edit")
    expect(observed?.sandbox).toBeDefined()
    expect(observed?.skills).toEqual(["coding"])
    expect(observed?.delegatedAuthority).toEqual(["read", "write"])
    expect(() => compileDsl(observed!.dsl, 'agents.delegate({"task":"again"})')).toThrow()
    expect(compileDsl(observed!.dsl, "files.inspect({})").operations[0]?.operationId).toBe("files.inspect")
    expect(value.childEvents.some((event) => event.detail === "secret command and touched paths")).toBe(true)
    expect(JSON.stringify(value.result)).not.toContain("secret command")
  })

  it("serializes children", async () => {
    let active = 0; let maximum = 0; const order: string[] = []
    const program = Effect.gen(function*() {
      const env = yield* setup((input) => Effect.gen(function*() { active++; maximum = Math.max(maximum, active); order.push(`start:${input.task}`); yield* Effect.sleep("20 millis"); order.push(`end:${input.task}`); active--; return { text: input.task, usage: zeroUsage } }))
      const a = yield* Effect.forkChild(env.delegation.delegate(env.input(2)))
      const b = yield* Effect.forkChild(env.delegation.delegate(env.input(3)))
      yield* Fiber.join(a); yield* Fiber.join(b)
    })
    await Effect.runPromise(program)
    expect(maximum).toBe(1)
    expect(order).toEqual(["start:task-2", "end:task-2", "start:task-3", "end:task-3"])
  })

  it("blocks recursion by graph and independently by depth", async () => {
    expect(() => compileDsl(withoutDelegation(dsl), 'agents.delegate({"task":"x"})')).toThrow()
    const program = Effect.gen(function*() { const env = yield* setup(() => Effect.succeed({ text: "no", usage: zeroUsage })); return yield* Effect.flip(env.delegation.delegate(env.input(2, { depth: 1 }))) })
    const error = await Effect.runPromise(program)
    expect(error).toBeInstanceOf(DelegationRejected)
    expect(error).toMatchObject({ _tag: "DelegationRejected", reason: "depth" })
  })

  it("reserves available budget and reconciles actual child usage", async () => {
    let childLimits: RunBudgetLimits | undefined
    const program = Effect.gen(function*() {
      const env = yield* setup((input) => { childLimits = input.run.limits; return Effect.succeed({ text: "ok", usage: { ...zeroUsage, turns: 2, operations: 3, outputBytes: 12 } }) })
      const parent = yield* env.store.getRun(rid(1)); yield* env.store.commit(parent.id, { expectedVersion: parent.version, usage: { ...zeroUsage, turns: 8, operations: 7 }, events: [] })
      yield* env.delegation.delegate(env.input(2))
      return yield* env.store.getRun(rid(1))
    })
    const parent = await Effect.runPromise(program)
    expect(childLimits?.maxTurns).toBe(2)
    expect(childLimits?.maxOperations).toBe(3)
    expect(parent.usage.turns).toBe(10)
    expect(parent.usage.operations).toBe(10)
    expect(parent.usage.outputBytes).toBe(12)
  })

  it("propagates parent cancellation and keeps durable linkage", async () => {
    const started = await Effect.runPromise(Deferred.make<void>())
    const program = Effect.gen(function*() {
      const env = yield* setup(() => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)))
      const fiber = yield* Effect.forkChild(env.delegation.delegate(env.input(2)))
      yield* Deferred.await(started)
      const at = yield* Clock.currentTimeMillis
      yield* env.store.requestCancellation(rid(1), at)
      yield* Fiber.await(fiber)
      const child = yield* env.store.getRun(rid(2)); const parentEvents = yield* env.store.events(rid(1)); const childEvents = yield* env.store.events(rid(2))
      return { child, parentEvents, childEvents }
    })
    const value = await Effect.runPromise(program)
    expect(value.child.status).toBe("Cancelled")
    expect(value.child.parentRunId).toBe(rid(1))
    expect(value.child.parentStepId).toBe("step-2")
    expect(value.parentEvents.some((event) => event.childRunId === rid(2))).toBe(true)
    expect(value.childEvents.every((event) => event.parentRunId === rid(1))).toBe(true)
  })
})
