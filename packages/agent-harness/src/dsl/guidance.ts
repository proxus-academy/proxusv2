import type { DslDefinition } from "./definition.js"
/** Deterministic model guidance derived from the runtime graph. */
export const renderDslGuidance = (definition: DslDefinition): string => {
  const lines=[`DSL ${definition.id} v${definition.version}`,"Use exactly one single-line chain with JSON-compatible arguments."]
  const visit=(path:string,contextName:string,seen:ReadonlySet<string>)=>{if(seen.has(`${path}:${contextName}`))return;const next=new Set(seen).add(`${path}:${contextName}`);const context=definition.contexts[contextName]!;for(const name of Object.keys(context.methods).sort()){const method=context.methods[name]!;const marker=method.kind==="transition"?"context":`${method.operationKind}${method.approval.required?", approval required":""}`;lines.push(`- ${path}.${name}(...) [${marker}; cost ${method.cost}]${method.kind==="operation"?` id=${method.id}`:""}`);const to=method.kind==="transition"?method.to:method.to;if(to !== undefined)visit(`${path}.${name}(...)`,to,next)}}
  for(const root of Object.keys(definition.roots).sort())visit(root,definition.roots[root]!,new Set())
  return lines.join("\n")
}
