import { describe, expect, it } from "vitest"
import { Cause, Effect, Exit, Layer, Schema } from "effect"
import { makeAgentId, makeRunId } from "../ids.js"
import { Dsl } from "./definition.js"
import {
  ApprovalRejected,
  DslHandlers,
  DslRuntime,
  OperationApproval,
  OperationDenied,
  OperationPolicy,
  OperationResultInvalid,
  RunVariables,
  type ApprovalBinding,
  type OperationContext,
  type PolicyDecision,
} from "./runtime.js"

const None = Schema.Undefined
const definition = Dsl.define({
  id: "runtime-test",
  version: 4,
  roots: { work: "work" },
  contexts: {
    work: { methods: {
      first: Dsl.operation(Schema.Struct({ value: Schema.String }), Schema.String, { id: "work.first", to: "after-first" }),
      variable: Dsl.operation(None, Schema.String, { id: "work.variable" }),
      approved: Dsl.operation(Schema.Struct({ value: Schema.String, diffHash: Schema.optional(Schema.String), expectedBaseSha: Schema.optional(Schema.String), expectedHeadSha: Schema.optional(Schema.String) }), Schema.String, { id: "work.approved", kind: "mutation", approval: { required: true, reason: "publishes" } }),
      invalidResult: Dsl.operation(None, Schema.String, { id: "work.invalid-result" }),
    } },
    "after-first": { methods: {
      second: Dsl.operation(Schema.Struct({ value: Schema.String }), Schema.String, { id: "work.second" }),
    } },
  },
})

const context: OperationContext = {
  runId: makeRunId("00000000-0000-4000-8000-000000000001"),
  agentId: makeAgentId("engineering"),
  actorId: "actor-1",
  tenantId: "tenant-1",
  variables: RunVariables.make({ token: "resolved" }),
  delegatedAuthority: [],
}

type Counters = { policy: number; approval: number; handlers: number }
const layers = (
  counters: Counters,
  options: {
    readonly decision?: PolicyDecision
    readonly approval?: (binding: ApprovalBinding) => Effect.Effect<void, ApprovalRejected>
    readonly invalidResult?: boolean
    readonly order?: Array<string>
  } = {},
) => {
  const handlers = DslRuntime.handlersLayer(definition)({
    "work.first": (input: { readonly value: string }) => Effect.sync(() => { counters.handlers++; options.order?.push("first"); return input.value }),
    "work.second": (input: { readonly value: string }) => Effect.sync(() => { counters.handlers++; options.order?.push("second"); return input.value }),
    "work.variable": (_input: undefined, operationContext: OperationContext) => operationContext.variables.require("required", Schema.String).pipe(
      Effect.tap(() => Effect.sync(() => { counters.handlers++ })),
    ),
    "work.approved": (input: { readonly value: string }) => Effect.sync(() => { counters.handlers++; return input.value }),
    "work.invalid-result": () => Effect.sync(() => { counters.handlers++; return options.invalidResult === true ? 42 as never : "valid" }),
  })
  const policy = Layer.succeed(OperationPolicy, OperationPolicy.of({
    authorize: Effect.fn("TestPolicy.authorize")(() => Effect.sync(() => { counters.policy++; return options.decision ?? { _tag: "Allowed", requiresApproval: false } })),
  }))
  const approval = Layer.succeed(OperationApproval, OperationApproval.of({
    verify: Effect.fn("TestApproval.verify")((binding) => Effect.sync(() => { counters.approval++ }).pipe(
      Effect.andThen(options.approval?.(binding) ?? Effect.void),
    )),
  }))
  return Layer.mergeAll(handlers, policy, approval)
}

const runExit = (source: string, counters: Counters, options?: Parameters<typeof layers>[1]) =>
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.runPromiseExit(DslRuntime.execute(definition, source, context).pipe(Effect.provide(layers(counters, options))))

const failure = (exit: Exit.Exit<unknown, unknown>) => {
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isSuccess(exit)) throw new Error("expected failure")
  return Cause.squash(exit.cause)
}

describe("DSL runtime", () => {
  // @effect-diagnostics-next-line asyncFunction:off
  it("performs no policy, approval, or handler effects when full compilation fails", async () => {
    const counters = { policy: 0, approval: 0, handlers: 0 }
    const exit = await runExit('work.first({"value":"ok"}).missing()', counters)
    expect(Exit.isFailure(exit)).toBe(true)
    expect(counters).toEqual({ policy: 0, approval: 0, handlers: 0 })
  })

  // @effect-diagnostics-next-line asyncFunction:off
  it("stops before approval and handlers when policy denies an operation", async () => {
    const counters = { policy: 0, approval: 0, handlers: 0 }
    const exit = await runExit('work.first({"value":"ok"})', counters, { decision: { _tag: "Denied", reason: "read scope absent" } })
    expect(failure(exit)).toBeInstanceOf(OperationDenied)
    expect(counters).toEqual({ policy: 1, approval: 0, handlers: 0 })
  })

  // @effect-diagnostics-next-line asyncFunction:off
  it("fails closed for a missing run variable before the external handler effect", async () => {
    const counters = { policy: 0, approval: 0, handlers: 0 }
    const exit = await runExit("work.variable()", counters)
    expect((failure(exit) as { _tag: string })._tag).toBe("MissingRunVariable")
    expect(counters).toEqual({ policy: 1, approval: 0, handlers: 0 })
  })

  // @effect-diagnostics-next-line asyncFunction:off
  it("binds approval to run, operation, plan, and concrete arguments", async () => {
    const counters = { policy: 0, approval: 0, handlers: 0 }
    let observed: ApprovalBinding | undefined
    const exit = await runExit('work.approved({"value":"publish"})', counters, {
      approval: (binding) => Effect.sync(() => { observed = binding }),
    })
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(observed).toMatchObject({ runId: context.runId, operationId: "work.approved" })
    expect(observed?.planFingerprint).toMatch(/^fnv1a32:/)
    expect(observed?.argumentFingerprint).toMatch(/^fnv1a32:/)
    expect(counters).toEqual({ policy: 1, approval: 1, handlers: 1 })
  })

  // @effect-diagnostics-next-line asyncFunction:off
  it("binds approval to diff and expected SHAs and invalidates any changed evidence", async () => {
    const counters = { policy: 0, approval: 0, handlers: 0 }
    const approved = { diffFingerprint: "sha256:diff-a", expectedBaseSha: "base-a", expectedHeadSha: "head-a" }
    const source = 'work.approved({"value":"publish","diffHash":"sha256:diff-b","expectedBaseSha":"base-a","expectedHeadSha":"head-a"})'
    const exit = await runExit(source, counters, {
      approval: (binding) => binding.diffFingerprint === approved.diffFingerprint && binding.expectedBaseSha === approved.expectedBaseSha && binding.expectedHeadSha === approved.expectedHeadSha
        ? Effect.void
        : Effect.fail(new ApprovalRejected({ operationId: binding.operationId, reason: "approval evidence changed" })),
    })
    expect(failure(exit)).toBeInstanceOf(ApprovalRejected)
    expect(counters.handlers).toBe(0)
  })

  // @effect-diagnostics-next-line asyncFunction:off
  it("does not execute when approval rejects the exact binding", async () => {
    const counters = { policy: 0, approval: 0, handlers: 0 }
    const exit = await runExit('work.approved({"value":"publish"})', counters, {
      approval: (binding) => Effect.fail(new ApprovalRejected({ operationId: binding.operationId, reason: "binding mismatch" })),
    })
    expect(failure(exit)).toBeInstanceOf(ApprovalRejected)
    expect(counters.handlers).toBe(0)
  })

  // @effect-diagnostics-next-line asyncFunction:off
  it("validates every handler result against its declaration", async () => {
    const counters = { policy: 0, approval: 0, handlers: 0 }
    const exit = await runExit("work.invalidResult()", counters, { invalidResult: true })
    expect(failure(exit)).toBeInstanceOf(OperationResultInvalid)
    expect(counters.handlers).toBe(1)
  })

  // @effect-diagnostics-next-line asyncFunction:off
  it("authorizes and executes operations strictly in chain order", async () => {
    const counters = { policy: 0, approval: 0, handlers: 0 }
    const order: Array<string> = []
    const exit = await runExit('work.first({"value":"one"}).second({"value":"two"})', counters, { order })
    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) {
      expect(exit.value.operations.map((item) => item.value)).toEqual(["one", "two"])
      expect(exit.value.value).toBe("two")
    }
    expect(order).toEqual(["first", "second"])
    expect(counters.policy).toBe(2)
  })
})
