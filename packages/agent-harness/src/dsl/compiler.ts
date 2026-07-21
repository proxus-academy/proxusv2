import { Data, Schema } from "effect"
import type { DslDefinition, OperationKind, ApprovalMetadata } from "./definition.js"
import { DslParseFailure, parseDslChain, type SourceLocation } from "./parser.js"

export interface DslLimits { readonly maxSourceLength: number; readonly maxChainLength: number; readonly maxEstimatedCost: number }
export const defaultDslLimits: DslLimits = Object.freeze({ maxSourceLength: 8_192, maxChainLength: 32, maxEstimatedCost: 1_000 })
export type JsonValue = null | boolean | number | string | ReadonlyArray<JsonValue> | { readonly [key: string]: JsonValue }
export interface CompiledDslOperation { readonly operationId: string; readonly path: string; readonly contextInputs: ReadonlyArray<JsonValue | undefined>; readonly input: JsonValue | undefined; readonly kind: OperationKind; readonly approval: ApprovalMetadata; readonly definitionVersion: number; readonly estimatedCost: number }
export interface CompiledDslPlan { readonly formatVersion: 1; readonly definitionId: string; readonly definitionVersion: number; readonly source: string; readonly operations: ReadonlyArray<CompiledDslOperation>; readonly estimatedCost: number; readonly fingerprint: string }
export interface DslCompileErrorShape { readonly code: string; readonly message: string; readonly location: SourceLocation; readonly expected: string | undefined; readonly availableMethods: ReadonlyArray<string>; readonly suggestions: ReadonlyArray<string>; readonly hint: string }
export class DslCompileError extends Data.TaggedError("DslCompileError")<DslCompileErrorShape> {
  constructor(code: string, message: string, location: SourceLocation, availableMethods: ReadonlyArray<string> = [], suggestions: ReadonlyArray<string> = [], hint = "Use one declared root followed by static method calls with JSON arguments.", expected?: string) { super({ code, message, location, availableMethods, suggestions, hint, expected }) }
}
const distance = (a: string, b: string) => { const row = [...Array(b.length + 1).keys()]; for (let i=1;i<=a.length;i++) { let prev=row[0]!; row[0]=i; for(let j=1;j<=b.length;j++){const old=row[j]!; row[j]=Math.min(row[j]!+1,row[j-1]!+1,prev+(a[i-1]===b[j-1]?0:1));prev=old} } return row[b.length]! }
const suggestions = (value: string, choices: ReadonlyArray<string>) => [...choices].sort((a,b)=>distance(value,a)-distance(value,b)||a.localeCompare(b)).filter(x=>distance(value,x)<=Math.max(2,Math.floor(value.length/3))).slice(0,3)
const stable = (value: unknown): string => value === undefined ? "undefined" : value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(stable).join(",")}]` : `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(",")}}`
const hash = (text: string) => { let h=2166136261; for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)} return `fnv1a32:${(h>>>0).toString(16).padStart(8,"0")}` }
const inputOf = (args: ReadonlyArray<unknown>): unknown => args.length === 0 ? undefined : args.length === 1 ? args[0] : args
const jsonValue = (value: unknown): value is JsonValue | undefined => value === undefined || value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || (Array.isArray(value) && value.every(jsonValue)) || (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype && Object.values(value as object).every(jsonValue))

export const compileDsl = (definition: DslDefinition, source: string, partialLimits: Partial<DslLimits> = {}): CompiledDslPlan => {
  const limits = { ...defaultDslLimits, ...partialLimits }
  if (source.length > limits.maxSourceLength) throw new DslCompileError("SOURCE_TOO_LONG", `Source exceeds ${limits.maxSourceLength} characters`, { offset: limits.maxSourceLength, line: 1, column: limits.maxSourceLength + 1 })
  let chain
  try { chain = parseDslChain(source) } catch (e) { if (e instanceof DslParseFailure) throw new DslCompileError(e.code, e.message, e.location); throw e }
  if (chain.calls.length > limits.maxChainLength) throw new DslCompileError("CHAIN_TOO_LONG", `Chain exceeds ${limits.maxChainLength} calls`, chain.calls[limits.maxChainLength]!.location)
  const roots = Object.keys(definition.roots).sort()
  const initialContext = definition.roots[chain.root]
  if (initialContext === undefined) throw new DslCompileError("UNKNOWN_ROOT", `Unknown root '${chain.root}'`, { offset: 0, line: 1, column: 1 }, roots, suggestions(chain.root, roots), `Available roots: ${roots.join(", ")}`)
  let contextName: string = initialContext
  const path = [chain.root]; const contextInputs: Array<JsonValue | undefined> = []; const operations: Array<CompiledDslOperation> = []; let cost = 0; let mutations = 0
  for (let index=0;index<chain.calls.length;index++) {
    const call=chain.calls[index]!; const context = definition.contexts[contextName]; if (context === undefined) throw new Error(`Invalid DSL context: ${contextName}`); const available=Object.keys(context.methods).sort(); const method = context.methods[call.name]
    if (method === undefined) throw new DslCompileError("METHOD_NOT_AVAILABLE", `'${call.name}' is not available after '${path.join(".")}'`, call.location, available, suggestions(call.name,available), `Choose one of: ${available.join(", ")}`)
    let decoded: unknown
    try { decoded=Schema.decodeUnknownSync(method.input)(inputOf(call.arguments)) } catch { throw new DslCompileError("INVALID_ARGUMENT", `Arguments for '${call.name}' do not match its schema`, call.location, available, [], "Pass JSON-compatible arguments matching the declared schema.", String(method.input.ast)) }
    if (!jsonValue(decoded)) throw new DslCompileError("NON_SERIALIZABLE_INPUT", `Decoded input for '${call.name}' is not JSON-serializable`, call.location)
    cost += method.cost
    if (cost > limits.maxEstimatedCost) throw new DslCompileError("COST_LIMIT_EXCEEDED", `Estimated cost exceeds ${limits.maxEstimatedCost}`, call.location)
    path.push(call.name)
    if (method.kind === "transition") { contextInputs.push(decoded); contextName=method.to; continue }
    if (index !== chain.calls.length-1 && method.to === undefined) throw new DslCompileError("TERMINAL_NOT_LAST", `Terminal operation '${call.name}' must end the chain`, chain.calls[index+1]!.location)
    if (method.operationKind === "mutation" && ++mutations > 1) throw new DslCompileError("MUTATION_LIMIT_EXCEEDED", "At most one mutation is allowed per expression", call.location)
    operations.push({ operationId: method.id, path: path.join("."), contextInputs: Object.freeze([...contextInputs]), input: decoded, kind: method.operationKind, approval: method.approval, definitionVersion: definition.version, estimatedCost: method.cost })
    if (method.to !== undefined) contextName = method.to
  }
  if (operations.length===0) throw new DslCompileError("EXPECTED_TERMINAL", "The chain must end in a terminal operation", chain.calls.at(-1)!.location, Object.keys(definition.contexts[contextName]?.methods ?? {}).sort())
  const body={ formatVersion:1 as const, definitionId:definition.id, definitionVersion:definition.version, source, operations, estimatedCost:cost }
  return Object.freeze({ ...body, operations:Object.freeze(operations), fingerprint:hash(stable(body)) })
}
