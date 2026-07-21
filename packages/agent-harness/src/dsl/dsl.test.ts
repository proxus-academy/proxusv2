import { describe, expect, it } from "vitest"
import { Schema } from "effect"
import { compileDsl, defaultDslLimits, DslCompileError } from "./compiler.js"
import { Dsl } from "./definition.js"
import { renderDslGuidance } from "./guidance.js"
import { parseDslChain } from "./parser.js"
import { renderDslValue } from "./renderer.js"

const None=Schema.Undefined
const definition=Dsl.define({id:"engineering",version:3,roots:{github:"github",repository:"repo"},contexts:{
 github:{methods:{repository:Dsl.transition(Schema.String,"repository")}},
 repository:{methods:{issue:Dsl.transition(Schema.Int,"issue")}},
 issue:{methods:{inspect:Dsl.operation(None,Schema.String,{id:"github.issue.inspect",to:"inspected"})}},
 inspected:{methods:{summarize:Dsl.operation(Schema.Struct({detail:Schema.Boolean}),Schema.String,{id:"github.issue.summarize"}),mutate:Dsl.operation(None,Schema.String,{id:"github.issue.mutate",kind:"mutation",to:"mutated"})}},
 mutated:{methods:{again:Dsl.operation(None,Schema.String,{id:"github.issue.mutate-again",kind:"mutation"})}},
 repo:{methods:{search:Dsl.operation(Schema.Struct({query:Schema.String,paths:Schema.Array(Schema.String)}),Schema.String,{id:"repository.search"})}}
}})
const error=(source:string)=>{try{compileDsl(definition,source);throw new Error("compiled")}catch(e){expect(e).toBeInstanceOf(DslCompileError);return e as DslCompileError}}

describe("one-line parser",()=>{
 it("parses nested JSON and positional literals",()=>expect(parseDslChain('repository.search({"query":"a,)\\\"b","paths":["src"]})').calls[0]!.arguments).toEqual([{query:'a,)"b',paths:["src"]}]))
 it.each(["x\ny()","x;y()","x = y()","x[y]()","return x.y()","x.y(undefined)","x.y('no')","x.y({a:1})","x.y() trailing"])("rejects forbidden source %s",source=>expect(()=>parseDslChain(source)).toThrow())
 it("never hangs or accepts random punctuation",()=>{let seed=17;for(let i=0;i<2000;i++){seed=(seed*48271)%2147483647;const length=seed%80;let text="";for(let j=0;j<length;j++){seed=(seed*48271)%2147483647;text+=String.fromCharCode(1+(seed%126))}try{parseDslChain(text)}catch{}}})
})

describe("contextual compiler and serializable plan",()=>{
 it("decodes all calls and emits a deterministic pure plan",()=>{const source='github.repository("proxus").issue(431).inspect().summarize({"detail":true})';const a=compileDsl(definition,source),b=compileDsl(definition,source);expect(a).toEqual(b);expect(a.operations.map(x=>x.operationId)).toEqual(["github.issue.inspect","github.issue.summarize"]);expect(()=>JSON.parse(JSON.stringify(a))).not.toThrow();expect(a.definitionVersion).toBe(3)})
 it("uses contextual availability and suggestions",()=>{const e=error('github.repositry("x")');expect(e.code).toBe("METHOD_NOT_AVAILABLE");expect(e.suggestions).toContain("repository");expect(e.availableMethods).toEqual(["repository"])})
 it("rejects every malformed argument before returning a plan",()=>expect(error('github.repository(1).issue("x").inspect()').code).toBe("INVALID_ARGUMENT"))
 it("enforces roots, terminal, source, chain, cost and terminal position",()=>{expect(error("missing.call()").code).toBe("UNKNOWN_ROOT");expect(error('github.repository("x")').code).toBe("EXPECTED_TERMINAL");expect(error('repository.search({"query":"x","paths":[]}).extra()').code).toBe("TERMINAL_NOT_LAST");expect(error("x".repeat(defaultDslLimits.maxSourceLength+1)).code).toBe("SOURCE_TOO_LONG");expect(()=>compileDsl(definition,'github.repository("x").issue(1).inspect().summarize({"detail":true})',{maxChainLength:3})).toThrow(/exceeds/);expect(()=>compileDsl(definition,'repository.search({"query":"x","paths":[]})',{maxEstimatedCost:0})).toThrow(/cost/)})
 it("allows queries but no more than one mutation",()=>expect(error('github.repository("x").issue(1).inspect().mutate().again()').code).toBe("MUTATION_LIMIT_EXCEEDED"))
 it("has graph-derived deterministic guidance",()=>{const text=renderDslGuidance(definition);expect(text).toContain("github.repository");expect(text).toContain("id=repository.search")})
 it("round-trips generated JSON literals",()=>{let seed=91;for(let i=0;i<500;i++){seed=(seed*16807)%2147483647;const value={query:`q${seed}\\\"`,paths:[`p${seed%13}`]};const plan=compileDsl(definition,`repository.search(${JSON.stringify(value)})`);expect(plan.operations[0]!.input).toEqual(value)}})
})

describe("bounded renderer",()=>{
 it("renders text and redacts nested secrets",()=>expect(renderDslValue({ok:true,nested:{token:"bad"}}).text).toContain("[REDACTED]"))
 it("bounds UTF-8 and references artifacts",()=>{const rendered=renderDslValue("😀".repeat(100),{maxOutputBytes:100,storeArtifact:(content,type)=>({artifactId:"artifact-1",mediaType:type,bytes:content.length})});expect(new TextEncoder().encode(rendered.text).length).toBeLessThanOrEqual(100);expect(rendered.artifact?.artifactId).toBe("artifact-1")})
})
