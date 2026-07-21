import { Schema } from "effect"
import { makeDslDefinitionId, makeOperationId, type DslDefinitionId, type OperationId } from "../ids.js"

export type OperationKind = "query" | "mutation"
export interface ApprovalMetadata { readonly required: boolean; readonly reason?: string }
export interface TransitionDeclaration<I extends Schema.ConstraintDecoder<unknown> = Schema.ConstraintDecoder<unknown>> { readonly kind: "transition"; readonly input: I; readonly to: string; readonly cost: number }
export interface OperationDeclaration<I extends Schema.ConstraintDecoder<unknown> = Schema.ConstraintDecoder<unknown>, O extends Schema.ConstraintDecoder<unknown> = Schema.ConstraintDecoder<unknown>, Id extends string = string> { readonly kind: "operation"; readonly id: Id; readonly input: I; readonly output: O; readonly operationKind: OperationKind; readonly approval: ApprovalMetadata; readonly cost: number; readonly to?: string }
export type MethodDeclaration = TransitionDeclaration | OperationDeclaration
export interface ContextDeclaration { readonly methods: Readonly<Record<string, MethodDeclaration>> }
export interface DslDefinition { readonly id: DslDefinitionId; readonly version: number; readonly roots: Readonly<Record<string, string>>; readonly contexts: Readonly<Record<string, ContextDeclaration>> }

const positiveCost = (cost: number | undefined) => {
  const value = cost ?? 1
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("DSL method cost must be a non-negative safe integer")
  return value
}
export const transition = <I extends Schema.ConstraintDecoder<unknown>>(input: I, to: string, options?: { readonly cost?: number }): TransitionDeclaration<I> => Object.freeze({ kind: "transition", input, to, cost: positiveCost(options?.cost) })
export const operation = <I extends Schema.ConstraintDecoder<unknown>, O extends Schema.ConstraintDecoder<unknown>, const C extends { readonly id: string; readonly kind?: OperationKind; readonly approval?: ApprovalMetadata; readonly cost?: number; readonly to?: string }>(input: I, output: O, config: C): OperationDeclaration<I, O, C["id"]> => Object.freeze({ kind: "operation", id: makeOperationId(config.id), input, output, operationKind: config.kind ?? "query", approval: Object.freeze(config.approval ?? { required: false }), cost: positiveCost(config.cost), ...(config.to === undefined ? {} : { to: config.to }) }) as OperationDeclaration<I, O, C["id"]>

type DslInput = { readonly id: string; readonly version: number; readonly roots: Readonly<Record<string, string>>; readonly contexts: Readonly<Record<string, ContextDeclaration>> }
export type DefinedDsl<D extends DslInput> = Omit<D, "id"> & { readonly id: DslDefinitionId & D["id"] }

export const defineDsl = <const D>(input: D extends DslInput ? D : never): D extends DslInput ? DefinedDsl<D> : never => {
  if (!Number.isSafeInteger(input.version) || input.version < 1) throw new Error("DSL version must be a positive safe integer")
  for (const [root, context] of Object.entries(input.roots)) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(root)) throw new Error(`Invalid DSL root: ${root}`)
    if (input.contexts[context] === undefined) throw new Error(`Unknown context '${context}' for root '${root}'`)
  }
  const operationIds = new Set<string>()
  for (const [contextName, context] of Object.entries(input.contexts)) for (const [name, method] of Object.entries(context.methods)) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) throw new Error(`Invalid method '${name}' in context '${contextName}'`)
    if (method.kind === "transition" && input.contexts[method.to] === undefined) throw new Error(`Unknown transition context '${method.to}'`)
    if (method.kind === "operation") { if (operationIds.has(method.id)) throw new Error(`Duplicate operation ID '${method.id}'`); operationIds.add(method.id); if (method.to !== undefined && input.contexts[method.to] === undefined) throw new Error(`Unknown operation context '${method.to}'`) }
  }
  return Object.freeze({ id: makeDslDefinitionId(input.id), version: input.version, roots: Object.freeze({ ...input.roots }), contexts: Object.freeze({ ...input.contexts }) }) as unknown as D extends DslInput ? DefinedDsl<D> : never
}

export const Dsl = { define: defineDsl, transition, operation } as const
