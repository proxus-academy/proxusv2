// @effect-diagnostics strictBooleanExpressions:off effectSucceedWithVoid:off
import { Resource } from "alchemy"
import { Unowned } from "alchemy/AdoptPolicy"
import { deepEqual, isResolved } from "alchemy/Diff"
import * as Provider from "alchemy/Provider"
import * as Data from "effect/Data"
import * as Layer from "effect/Layer"
import * as Effect from "effect/Effect"
import type { Address, ForwardingRule, SslCertificate, TargetHttpsProxy, UrlMap } from "@distilled.cloud/gcp/compute-v1"

export type GlobalResourceLink<Kind extends string> = string & { readonly __globalResource: Kind }
export class EdgeClientError extends Data.TaggedError("EdgeClientError")<{ readonly operation:string; readonly code:"not-found"|"forbidden"|"conflict"|"invalid"|"timeout"|"operation-failed"|"unknown" }>{}
export class EdgeDeletionProtectedError extends Data.TaggedError("EdgeDeletionProtectedError")<{readonly name:string}>{}
interface BaseProps {readonly project:string;readonly name:string;readonly deletionProtection:boolean}
interface BaseAttrs<P,K extends string> extends BaseProps {readonly id:string;readonly selfLink:GlobalResourceLink<K>}
export interface EdgeClient<A>{get(project:string,name:string):Effect.Effect<A,EdgeClientError>;create(project:string,body:A):Effect.Effect<A,EdgeClientError>;patch?(project:string,name:string,body:A):Effect.Effect<A,EdgeClientError>;delete(project:string,name:string):Effect.Effect<void,EdgeClientError>}
const missing=(e:EdgeClientError)=>e.code==="not-found"
const link=<K extends string>(s:string)=>s as GlobalResourceLink<K>

export interface GlobalAddressProps extends BaseProps {}
interface GlobalAddressAttributes extends BaseAttrs<GlobalAddressProps,"address">{readonly address:string}
export type GlobalAddress=Resource<"Proxus.GCP.Compute.GlobalAddress",GlobalAddressProps,GlobalAddressAttributes>
export const GlobalAddress=Resource<GlobalAddress>("Proxus.GCP.Compute.GlobalAddress")
const addressBody=(p:GlobalAddressProps):Address=>({name:p.name,addressType:"EXTERNAL",ipVersion:"IPV4",networkTier:"PREMIUM"})
const addressSecure=(v:Address)=>v.addressType==="EXTERNAL"&&v.ipVersion==="IPV4"&&(v.networkTier===undefined||v.networkTier==="PREMIUM")

export interface ManagedSslCertificateProps extends BaseProps {readonly domains:readonly string[]}
interface ManagedSslCertificateAttributes extends BaseAttrs<ManagedSslCertificateProps,"sslCertificate">{}
export type ManagedSslCertificate=Resource<"Proxus.GCP.Compute.ManagedSslCertificate",ManagedSslCertificateProps,ManagedSslCertificateAttributes>
export const ManagedSslCertificate=Resource<ManagedSslCertificate>("Proxus.GCP.Compute.ManagedSslCertificate")
const certBody=(p:ManagedSslCertificateProps):SslCertificate=>({name:p.name,type:"MANAGED",managed:{domains:[...p.domains]}})
const certSecure=(v:SslCertificate,p:ManagedSslCertificateProps)=>v.type==="MANAGED"&&JSON.stringify([...(v.managed?.domains??[])].sort())===JSON.stringify([...p.domains].sort())

export interface UrlMapProps extends BaseProps {readonly defaultBackendBucket:GlobalResourceLink<"backendBucket">;readonly apiBackendService:GlobalResourceLink<"backendService">}
interface UrlMapAttributes extends BaseAttrs<UrlMapProps,"urlMap">{}
export type URLMap=Resource<"Proxus.GCP.Compute.URLMap",UrlMapProps,UrlMapAttributes>
export const URLMap=Resource<URLMap>("Proxus.GCP.Compute.URLMap")
const urlBody=(p:UrlMapProps):UrlMap=>({name:p.name,defaultService:p.defaultBackendBucket,hostRules:[{hosts:["*"],pathMatcher:"production"}],pathMatchers:[{name:"production",defaultService:p.defaultBackendBucket,routeRules:[{priority:1,matchRules:[{prefixMatch:"/api"}],service:p.apiBackendService,routeAction:{urlRewrite:{pathPrefixRewrite:"/"}}}]}]})
const urlSecure=(v:UrlMap,p:UrlMapProps)=>v.defaultService===p.defaultBackendBucket&&deepEqual(v.hostRules,urlBody(p).hostRules)&&deepEqual(v.pathMatchers,urlBody(p).pathMatchers)

export interface TargetHttpsProxyProps extends BaseProps {readonly urlMap:GlobalResourceLink<"urlMap">;readonly certificate:GlobalResourceLink<"sslCertificate">}
interface TargetHttpsProxyAttributes extends BaseAttrs<TargetHttpsProxyProps,"targetHttpsProxy">{}
export type TargetHttpsProxyResource=Resource<"Proxus.GCP.Compute.TargetHttpsProxy",TargetHttpsProxyProps,TargetHttpsProxyAttributes>
export const TargetHttpsProxyResource=Resource<TargetHttpsProxyResource>("Proxus.GCP.Compute.TargetHttpsProxy")
const proxyBody=(p:TargetHttpsProxyProps):TargetHttpsProxy=>({name:p.name,urlMap:p.urlMap,sslCertificates:[p.certificate]})
const proxySecure=(v:TargetHttpsProxy,p:TargetHttpsProxyProps)=>v.urlMap===p.urlMap&&v.sslCertificates?.length===1&&v.sslCertificates[0]===p.certificate

export interface GlobalForwardingRuleProps extends BaseProps {readonly address:GlobalResourceLink<"address">;readonly target:GlobalResourceLink<"targetHttpsProxy">}
interface GlobalForwardingRuleAttributes extends BaseAttrs<GlobalForwardingRuleProps,"forwardingRule">{}
export type GlobalForwardingRule=Resource<"Proxus.GCP.Compute.GlobalForwardingRule",GlobalForwardingRuleProps,GlobalForwardingRuleAttributes>
export const GlobalForwardingRule=Resource<GlobalForwardingRule>("Proxus.GCP.Compute.GlobalForwardingRule")
const forwardingBody=(p:GlobalForwardingRuleProps):ForwardingRule=>({name:p.name,IPAddress:p.address,target:p.target,IPProtocol:"TCP",portRange:"443",loadBalancingScheme:"EXTERNAL_MANAGED",networkTier:"PREMIUM"})
const forwardingSecure=(v:ForwardingRule,p:GlobalForwardingRuleProps)=>v.IPAddress===p.address&&v.target===p.target&&v.IPProtocol==="TCP"&&v.portRange==="443"&&v.loadBalancingScheme==="EXTERNAL_MANAGED"

function provider<P extends BaseProps,A extends {readonly id?:string;readonly selfLink?:string},K extends string>(resource:any,client:EdgeClient<A>,body:(p:P)=>A,secure:(a:A,p:P)=>boolean,mutable:boolean){const attrs=(v:A,p:P)=>({...p,id:v.id??"",selfLink:link<K>(v.selfLink??"")});return resource.Provider.of({nuke:{skip:true},stables:["project","name","id"],list:()=>Effect.succeed([]),diff:({news,olds,output}:any)=>!isResolved(news)?Effect.void:Effect.succeed(news.project!==(output?.project??olds.project)||news.name!==(output?.name??olds.name)||(!mutable&&JSON.stringify(news)!==JSON.stringify(output??olds))?{action:"replace"}as const:undefined),read:({output,olds}:any)=>{const p=(output??olds)as P;return client.get(p.project,p.name).pipe(Effect.map(v=>secure(v,p)?attrs(v,p):Unowned(attrs(v,p))),Effect.catchIf(missing,()=>Effect.succeed(undefined)))},reconcile:({news,output}:any)=>Effect.gen(function*(){let v=yield*client.get(news.project,news.name).pipe(Effect.catchIf(missing,()=>Effect.succeed(undefined)));if(v&&output===undefined&&!secure(v,news))return yield*new EdgeClientError({operation:`adopt-${news.name}`,code:"conflict"});if(!v)v=yield*client.create(news.project,body(news));else if(!secure(v,news)){if(!mutable||!client.patch)return yield*new EdgeClientError({operation:`replace-${news.name}`,code:"conflict"});v=yield*client.patch(news.project,news.name,body(news))}v=yield*client.get(news.project,news.name);if(!secure(v,news))return yield*new EdgeClientError({operation:`verify-${news.name}`,code:"operation-failed"});return attrs(v,news)}),delete:({output}:any)=>output.deletionProtection?Effect.fail(new EdgeDeletionProtectedError({name:output.name})):client.delete(output.project,output.name).pipe(Effect.catchIf(missing,()=>Effect.void))})}
export const edgeProviderServices=(c:{address:EdgeClient<Address>;certificate:EdgeClient<SslCertificate>;urlMap:EdgeClient<UrlMap>;proxy:EdgeClient<TargetHttpsProxy>;forwardingRule:EdgeClient<ForwardingRule>})=>({address:provider<GlobalAddressProps,Address,"address">(GlobalAddress,c.address,addressBody,addressSecure,false),certificate:provider<ManagedSslCertificateProps,SslCertificate,"sslCertificate">(ManagedSslCertificate,c.certificate,certBody,certSecure,false),urlMap:provider<UrlMapProps,UrlMap,"urlMap">(URLMap,c.urlMap,urlBody,urlSecure,true),proxy:provider<TargetHttpsProxyProps,TargetHttpsProxy,"targetHttpsProxy">(TargetHttpsProxyResource,c.proxy,proxyBody,proxySecure,true),forwardingRule:provider<GlobalForwardingRuleProps,ForwardingRule,"forwardingRule">(GlobalForwardingRule,c.forwardingRule,forwardingBody,forwardingSecure,true)})
export const edgeProviderLayer=(c:Parameters<typeof edgeProviderServices>[0])=>{const p=edgeProviderServices(c);return Layer.mergeAll(Provider.succeed(GlobalAddress,p.address),Provider.succeed(ManagedSslCertificate,p.certificate),Provider.succeed(URLMap,p.urlMap),Provider.succeed(TargetHttpsProxyResource,p.proxy),Provider.succeed(GlobalForwardingRule,p.forwardingRule))}
