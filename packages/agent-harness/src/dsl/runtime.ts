import { Context, Data, Effect, Layer, Schema } from "effect"
import type { AgentId, OperationId, RunId } from "../ids.js"
import { MissingRunVariable } from "../errors.js"
import { compileDsl, DslCompileError, type CompiledDslOperation, type CompiledDslPlan, type DslLimits } from "./compiler.js"
import type { DslDefinition, OperationDeclaration } from "./definition.js"

export interface RunVariables {
  readonly get: (name: string) => Effect.Effect<unknown | undefined>
  readonly require: <S extends Schema.ConstraintDecoder<unknown>>(name: string, schema: S) => Effect.Effect<S["Type"], MissingRunVariable | OperationInputInvalid>
}

export const RunVariables = {
  make(values: Readonly<Record<string, unknown>>): RunVariables {
    const snapshot = Object.freeze({ ...values })
    return {
      get: Effect.fn("RunVariables.get")((name: string) => Effect.succeed(snapshot[name])),
      require: Effect.fn("RunVariables.require")(<S extends Schema.ConstraintDecoder<unknown>>(name: string, schema: S) => {
        if (!(name in snapshot)) return Effect.fail(new MissingRunVariable({ name }))
        return Schema.decodeUnknownEffect(schema)(snapshot[name]).pipe(
          Effect.mapError(() => new OperationInputInvalid({ operationId: "run.variables" as OperationId, message: `Run variable '${name}' does not match its schema` })),
        ) as Effect.Effect<S["Type"], MissingRunVariable | OperationInputInvalid>
      }),
    }
  },
} as const

export interface OperationContext {
  readonly runId: RunId
  readonly agentId: AgentId
  readonly actorId: string
  readonly tenantId: string
  readonly variables: RunVariables
  readonly delegatedAuthority: ReadonlyArray<string>
}

/** Context visible only to typed handlers; transition arguments come from the validated pure plan. */
export interface HandlerOperationContext extends OperationContext {
  readonly operation: CompiledDslOperation
}

export type PolicyDecision =
  | { readonly _tag: "Allowed"; readonly requiresApproval: boolean }
  | { readonly _tag: "Denied"; readonly reason: string }

export class OperationPolicy extends Context.Service<OperationPolicy, {
  readonly authorize: (request: { readonly context: OperationContext; readonly plan: CompiledDslPlan; readonly operation: CompiledDslOperation }) => Effect.Effect<PolicyDecision, OperationPolicyFailure>
}>()("@proxus/agent-harness/dsl/runtime/OperationPolicy") {}

export interface ApprovalBinding {
  readonly runId: RunId
  readonly operationId: OperationId
  readonly planFingerprint: string
  readonly argumentFingerprint: string
  /** Hash of the exact diff reviewed by the approver. Required by publish operations. */
  readonly diffFingerprint?: string
  readonly expectedBaseSha?: string
  readonly expectedHeadSha?: string
}

export class OperationApproval extends Context.Service<OperationApproval, {
  readonly verify: (binding: ApprovalBinding) => Effect.Effect<void, ApprovalRejected>
}>()("@proxus/agent-harness/dsl/runtime/OperationApproval") {}

export class OperationUnavailable extends Data.TaggedError("OperationUnavailable")<{
  readonly operationId: OperationId
  readonly definitionVersion: number
}> {}
export class OperationInputInvalid extends Data.TaggedError("OperationInputInvalid")<{
  readonly operationId: OperationId
  readonly message: string
}> {}
export class OperationPolicyFailure extends Data.TaggedError("OperationPolicyFailure")<{
  readonly operationId: OperationId
  readonly message: string
}> {}
export class OperationDenied extends Data.TaggedError("OperationDenied")<{
  readonly operationId: OperationId
  readonly reason: string
}> {}
export class ApprovalRejected extends Data.TaggedError("ApprovalRejected")<{
  readonly operationId: OperationId
  readonly reason: string
}> {}
export class OperationResultInvalid extends Data.TaggedError("OperationResultInvalid")<{
  readonly operationId: OperationId
  readonly message: string
}> {}

export interface OperationExecutionResult {
  readonly operationId: OperationId
  readonly value: unknown
}
export interface DslExecutionResult {
  readonly plan: CompiledDslPlan
  readonly operations: ReadonlyArray<OperationExecutionResult>
  readonly value: unknown
}

type ErasedHandlerEffect = Effect.Effect<unknown, Error>
type Declarations<D> = D extends { readonly contexts: infer C }
  ? { [K in keyof C]: C[K] extends { readonly methods: infer M } ? { [P in keyof M]: M[P] }[keyof M] : never }[keyof C]
  : never
type Operations<D> = Declarations<D> extends infer O ? O extends { readonly kind: "operation"; readonly id: PropertyKey } ? O : never : never
type OperationById<D, Id> = Extract<Operations<D>, { readonly id: Id }>
type InputOf<O> = O extends { readonly input: infer S } ? S extends Schema.ConstraintDecoder<any> ? S["Type"] : never : never
type OutputOf<O> = O extends { readonly output: infer S } ? S extends Schema.ConstraintDecoder<any> ? S["Type"] : never : never
export type DslOperationIds<D> = Operations<D>["id"]
export type DslHandlerMap<D> = {
  readonly [Id in DslOperationIds<D>]: (input: InputOf<OperationById<D, Id>>, context: HandlerOperationContext) => Effect.Effect<OutputOf<OperationById<D, Id>>, Error, never>
}
type RequirementsOf<F> = F extends (...args: any[]) => Effect.Effect<any, any, infer R> ? R : never
type HandlerRequirements<H> = RequirementsOf<H[keyof H]>

interface RegisteredOperation {
  readonly declaration: OperationDeclaration
  readonly execute: (input: unknown, context: HandlerOperationContext) => ErasedHandlerEffect
}
export class DslHandlers extends Context.Service<DslHandlers, {
  readonly definitionId: string
  readonly definitionVersion: number
  readonly operations: ReadonlyMap<string, RegisteredOperation>
}>()("@proxus/agent-harness/dsl/runtime/DslHandlers") {}

const declarations = (definition: DslDefinition): ReadonlyMap<string, OperationDeclaration> => {
  const found = new Map<string, OperationDeclaration>()
  for (const context of Object.values(definition.contexts)) for (const method of Object.values(context.methods)) {
    if (method.kind === "operation") found.set(method.id, method)
  }
  return found
}

export const handlersLayer = <const D extends DslDefinition>(definition: D) => (
  handlers: DslHandlerMap<D>,
): Layer.Layer<DslHandlers, never, HandlerRequirements<DslHandlerMap<D>>> => Layer.effect(
  DslHandlers,
  Effect.gen(function*() {
    const context = yield* Effect.context<HandlerRequirements<DslHandlerMap<D>>>()
    const operations = new Map<string, RegisteredOperation>()
    for (const [id, declaration] of declarations(definition)) {
      const handler = handlers[id as keyof DslHandlerMap<D>] as unknown as (input: unknown, context: HandlerOperationContext) => Effect.Effect<unknown, Error, HandlerRequirements<DslHandlerMap<D>>>
      operations.set(id, { declaration, execute: (input, operationContext) => handler(input, operationContext).pipe(Effect.provideContext(context)) })
    }
    return DslHandlers.of({ definitionId: definition.id, definitionVersion: definition.version, operations })
  }),
)

export const fingerprint = (value: unknown): string => {
  const stable = JSON.stringify(value, (_key, item) => item !== null && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item)
  let hash = 2166136261
  for (let index = 0; index < stable.length; index++) { hash ^= stable.charCodeAt(index); hash = Math.imul(hash, 16777619) }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`
}

export type DslExecutionError<E = never> = DslCompileError | OperationUnavailable | OperationInputInvalid | OperationPolicyFailure | OperationDenied | ApprovalRejected | OperationResultInvalid | MissingRunVariable | E

export const executeDsl = <D extends DslDefinition>(
  definition: D,
  source: string,
  context: OperationContext,
  options: { readonly limits?: Partial<DslLimits> } = {},
): Effect.Effect<DslExecutionResult, DslExecutionError<Error>, DslHandlers | OperationPolicy | OperationApproval> => Effect.gen(function*() {
  // Compilation and every deployment/schema preflight happen synchronously before policy,
  // approval, handler, or other externally observable Effects are evaluated.
  const plan = yield* Effect.try({
    try: () => compileDsl(definition, source, options.limits),
    catch: (cause) => cause as DslCompileError,
  })
  const registry = yield* DslHandlers
  const prepared = yield* Effect.try({
    try: () => plan.operations.map((operation) => {
      const registered = registry.definitionId === plan.definitionId && registry.definitionVersion === operation.definitionVersion
        ? registry.operations.get(operation.operationId)
        : undefined
      if (registered === undefined) throw new OperationUnavailable({ operationId: operation.operationId as OperationId, definitionVersion: operation.definitionVersion })
      let input: unknown
      try { input = Schema.decodeUnknownSync(registered.declaration.input)(operation.input) }
      catch { throw new OperationInputInvalid({ operationId: operation.operationId as OperationId, message: "Compiled operation input no longer matches the registered schema" }) }
      return { operation, registered, input }
    }),
    catch: (cause) => cause as OperationUnavailable | OperationInputInvalid,
  })
  const policy = yield* OperationPolicy
  const approval = yield* OperationApproval
  const results: Array<OperationExecutionResult> = []
  for (const item of prepared) {
    const decision = yield* policy.authorize({ context, plan, operation: item.operation })
    if (decision._tag === "Denied") return yield* new OperationDenied({ operationId: item.operation.operationId as OperationId, reason: decision.reason })
    if (item.operation.approval.required || decision.requiresApproval) {
      const approvalInput = item.input as { readonly diffHash?: string; readonly expectedBaseSha?: string; readonly expectedHeadSha?: string }
      yield* approval.verify({
        runId: context.runId,
        operationId: item.operation.operationId as OperationId,
        planFingerprint: plan.fingerprint,
        argumentFingerprint: fingerprint(item.input),
        ...(approvalInput.diffHash === undefined ? {} : { diffFingerprint: approvalInput.diffHash }),
        ...(approvalInput.expectedBaseSha === undefined ? {} : { expectedBaseSha: approvalInput.expectedBaseSha }),
        ...(approvalInput.expectedHeadSha === undefined ? {} : { expectedHeadSha: approvalInput.expectedHeadSha }),
      })
    }
    const raw = yield* item.registered.execute(item.input, { ...context, operation: item.operation })
    const value = yield* Schema.decodeUnknownEffect(item.registered.declaration.output)(raw).pipe(
      Effect.mapError(() => new OperationResultInvalid({ operationId: item.operation.operationId as OperationId, message: "Handler result does not match the declared schema" })),
    )
    results.push({ operationId: item.operation.operationId as OperationId, value })
  }
  return { plan, operations: results, value: results.at(-1)?.value }
}) as any

export const DslRuntime = { handlersLayer, execute: executeDsl } as const
