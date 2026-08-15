// @effect-diagnostics strictBooleanExpressions:off effectSucceedWithVoid:off
import { Resource } from "alchemy"
import { Unowned } from "alchemy/AdoptPolicy"
import { isResolved } from "alchemy/Diff"
import * as Provider from "alchemy/Provider"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import type { BackendService as ApiBackendService, NetworkEndpointGroup } from "@distilled.cloud/gcp/compute-v1"

export class ComputeClientError extends Data.TaggedError("ComputeClientError")<{ readonly operation: string; readonly code: "not-found" | "forbidden" | "conflict" | "invalid" | "timeout" | "operation-failed" | "unknown" }> {}
export class ComputeDeletionProtectedError extends Data.TaggedError("ComputeDeletionProtectedError")<{ readonly name: string }> {}

export interface ServerlessNegProps { readonly project: string; readonly region: string; readonly name: string; readonly cloudRunService: string; readonly deletionProtection: boolean }
export interface ServerlessNegAttributes extends ServerlessNegProps { readonly id: string; readonly selfLink: string }
export type ServerlessNeg = Resource<"Proxus.GCP.Compute.ServerlessNeg", ServerlessNegProps, ServerlessNegAttributes>
export const ServerlessNeg = Resource<ServerlessNeg>("Proxus.GCP.Compute.ServerlessNeg")
export interface ServerlessNegClient { get(p:string,r:string,n:string): Effect.Effect<NetworkEndpointGroup,ComputeClientError>; create(p:string,r:string,b:NetworkEndpointGroup): Effect.Effect<NetworkEndpointGroup,ComputeClientError>; delete(p:string,r:string,n:string): Effect.Effect<void,ComputeClientError> }
const missing=(e:ComputeClientError)=>e.code==="not-found"
const negSecure=(v:NetworkEndpointGroup,p:ServerlessNegProps)=>v.networkEndpointType==="SERVERLESS"&&v.cloudRun?.service===p.cloudRunService
const negAttrs=(v:NetworkEndpointGroup,p:ServerlessNegProps):ServerlessNegAttributes=>({...p,id:v.id??"",selfLink:v.selfLink??""})
export const makeServerlessNegProviderService=(c:ServerlessNegClient)=>ServerlessNeg.Provider.of({ nuke:{skip:true},stables:["project","region","name","cloudRunService","id"],list:()=>Effect.succeed([]), diff:({news,olds,output})=>!isResolved(news)?Effect.void:Effect.succeed(["project","region","name","cloudRunService"].some(k=>(news as any)[k]!==((output??olds) as any)[k])?{action:"replace"}as const:undefined), read:({output,olds})=>{const p=(output??olds) as ServerlessNegProps;return c.get(p.project,p.region,p.name).pipe(Effect.map(v=>negSecure(v,p)?negAttrs(v,p):Unowned(negAttrs(v,p))),Effect.catchIf(missing,()=>Effect.succeed(undefined)))}, reconcile:({news,output})=>Effect.gen(function*(){let v=yield*c.get(news.project,news.region,news.name).pipe(Effect.catchIf(missing,()=>Effect.succeed(undefined)));if(v&&output===undefined&&!negSecure(v,news))return yield*new ComputeClientError({operation:"adopt-neg",code:"conflict"});if(!v)v=yield*c.create(news.project,news.region,{name:news.name,networkEndpointType:"SERVERLESS",cloudRun:{service:news.cloudRunService}});return negAttrs(v,news)}), delete:({output})=>output.deletionProtection?Effect.fail(new ComputeDeletionProtectedError({name:output.name})):c.delete(output.project,output.region,output.name).pipe(Effect.catchIf(missing,()=>Effect.void)) })
export const ServerlessNegProvider=(c:ServerlessNegClient)=>Provider.succeed(ServerlessNeg,makeServerlessNegProviderService(c))

export interface ComputeBackendServiceProps { readonly project:string; readonly name:string; readonly group:string; readonly deletionProtection:boolean }
export interface ComputeBackendServiceAttributes extends ComputeBackendServiceProps { readonly id:string; readonly selfLink:string }
export type ComputeBackendService=Resource<"Proxus.GCP.Compute.BackendService",ComputeBackendServiceProps,ComputeBackendServiceAttributes>
export const ComputeBackendService=Resource<ComputeBackendService>("Proxus.GCP.Compute.BackendService")
export interface ComputeBackendServiceClient { get(p:string,n:string):Effect.Effect<ApiBackendService,ComputeClientError>; create(p:string,b:ApiBackendService):Effect.Effect<ApiBackendService,ComputeClientError>; patch(p:string,n:string,b:ApiBackendService):Effect.Effect<ApiBackendService,ComputeClientError>; delete(p:string,n:string):Effect.Effect<void,ComputeClientError> }
const backendBody=(p:ComputeBackendServiceProps):ApiBackendService=>({name:p.name,loadBalancingScheme:"EXTERNAL_MANAGED",protocol:"HTTP",timeoutSec:60,backends:[{group:p.group}]})
const backendSecure=(v:ApiBackendService,p:ComputeBackendServiceProps)=>v.loadBalancingScheme==="EXTERNAL_MANAGED"&&v.protocol==="HTTP"&&v.timeoutSec===60&&v.backends?.length===1&&v.backends[0]?.group===p.group
const backendAttrs=(v:ApiBackendService,p:ComputeBackendServiceProps):ComputeBackendServiceAttributes=>({...p,id:v.id??"",selfLink:v.selfLink??""})
export const makeComputeBackendServiceProviderService=(c:ComputeBackendServiceClient)=>ComputeBackendService.Provider.of({nuke:{skip:true},stables:["project","name","id"],list:()=>Effect.succeed([]),diff:({news,olds,output})=>!isResolved(news)?Effect.void:Effect.succeed(news.project!==(output?.project??olds.project)||news.name!==(output?.name??olds.name)?{action:"replace"}as const:undefined),read:({output,olds})=>{const p=(output??olds)as ComputeBackendServiceProps;return c.get(p.project,p.name).pipe(Effect.map(v=>backendSecure(v,p)?backendAttrs(v,p):Unowned(backendAttrs(v,p))),Effect.catchIf(missing,()=>Effect.succeed(undefined)))},reconcile:({news,output})=>Effect.gen(function*(){let v=yield*c.get(news.project,news.name).pipe(Effect.catchIf(missing,()=>Effect.succeed(undefined)));if(v&&output===undefined&&!backendSecure(v,news))return yield*new ComputeClientError({operation:"adopt-backend-service",code:"conflict"});if(!v)v=yield*c.create(news.project,backendBody(news));else if(!backendSecure(v,news))v=yield*c.patch(news.project,news.name,backendBody(news));v=yield*c.get(news.project,news.name);if(!backendSecure(v,news))return yield*new ComputeClientError({operation:"verify-backend-service",code:"operation-failed"});return backendAttrs(v,news)}),delete:({output})=>output.deletionProtection?Effect.fail(new ComputeDeletionProtectedError({name:output.name})):c.delete(output.project,output.name).pipe(Effect.catchIf(missing,()=>Effect.void))})
export const ComputeBackendServiceProvider=(c:ComputeBackendServiceClient)=>Provider.succeed(ComputeBackendService,makeComputeBackendServiceProviderService(c))
