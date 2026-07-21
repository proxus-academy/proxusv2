import type { ConversationAddress, PublicRunEvent } from "@proxus/agent-harness/transport"
import { projectPublicRunEvent } from "@proxus/agent-harness/transport"
import type { RunId, SessionId } from "@proxus/agent-harness/ids"

export interface WebhookRequest { readonly headers: Readonly<Record<string, string | undefined>>; readonly body: string }
export interface VerifiedChatEvent { readonly deliveryId: string; readonly address: ConversationAddress; readonly actor: string; readonly kind: "message" | "approval"; readonly text?: string; readonly approvalId?: string; readonly decision?: "approved" | "denied" }
export interface WebhookAuthenticator { verify(request: WebhookRequest): VerifiedChatEvent }
export interface ChatMessage { readonly text: string; readonly card?: { readonly approvalId: string; readonly approveAction: string; readonly denyAction: string } }
export interface ChatOutput { post(address: ConversationAddress, idempotencyKey: string, message: ChatMessage): void }
export interface RunAdmission { start(sessionId: SessionId, runId: RunId, input: string): void; resumeApproval(runId: RunId, approvalId: string, decision: "approved" | "denied"): void }

interface Binding { readonly address: ConversationAddress; readonly sessionId: SessionId; readonly actor: string; activeRunId?: RunId; readonly queue: Array<{ deliveryId: string; text: string; runId: RunId }> }
interface Approval { readonly runId: RunId; readonly addressKey: string; readonly actor: string; resolved?: "approved" | "denied" }
export interface ChatStateSnapshot { readonly bindings: Array<[string, Binding]>; readonly deliveries: Array<[string, { runId: RunId; sessionId: SessionId }]>; readonly cursors: Array<[string, number]>; readonly posts: ReadonlyArray<string>; readonly approvals: Array<[string, Approval]> }

/** Durable adapter seam. Production persists this state transactionally; tests reopen snapshots. */
export class ChatState {
  private readonly bindings: Map<string, Binding>; private readonly deliveries: Map<string, { runId: RunId; sessionId: SessionId }>; private readonly cursors: Map<string, number>; private readonly posts: Set<string>; private readonly approvals: Map<string, Approval>
  constructor(snapshot?: ChatStateSnapshot) { this.bindings=new Map(snapshot?.bindings ?? []); this.deliveries=new Map(snapshot?.deliveries ?? []); this.cursors=new Map(snapshot?.cursors ?? []); this.posts=new Set(snapshot?.posts ?? []); this.approvals=new Map(snapshot?.approvals ?? []) }
  snapshot(): ChatStateSnapshot { return { bindings:[...this.bindings], deliveries:[...this.deliveries], cursors:[...this.cursors], posts:[...this.posts], approvals:[...this.approvals] } }
  binding(key:string){return this.bindings.get(key)} setBinding(key:string,value:Binding){this.bindings.set(key,value)}
  delivery(id:string){return this.deliveries.get(id)} setDelivery(id:string,value:{runId:RunId;sessionId:SessionId}){this.deliveries.set(id,value)}
  cursor(key:string){return this.cursors.get(key)??0} setCursor(key:string,value:number){this.cursors.set(key,value)}
  postOnce(key:string,post:()=>void){if(this.posts.has(key))return false;post();this.posts.add(key);return true}
  approval(id:string){return this.approvals.get(id)} setApproval(id:string,value:Approval){this.approvals.set(id,value)}
}
const addressKey=(a:ConversationAddress)=>JSON.stringify([a.tenant,a.conversation,a.thread])

export class GoogleChatApp {
  constructor(private readonly deps:{auth:WebhookAuthenticator;output:ChatOutput;runs:RunAdmission;state:ChatState;sessionId:()=>SessionId;runId:()=>RunId}){}
  webhook(request:WebhookRequest):{status:200|401;body:string}{let event:VerifiedChatEvent;try{event=this.deps.auth.verify(request)}catch{return{status:401,body:"unauthorized"}};if(event.kind==="approval")return this.resolve(event);return this.admit(event)}
  private admit(event:VerifiedChatEvent){const duplicate=this.deps.state.delivery(event.deliveryId);if(duplicate!==undefined)return{status:200 as const,body:JSON.stringify(duplicate)};const key=addressKey(event.address);let binding=this.deps.state.binding(key);if(binding===undefined){binding={address:event.address,sessionId:this.deps.sessionId(),actor:event.actor,queue:[]};this.deps.state.setBinding(key,binding)}const runId=this.deps.runId();this.deps.state.setDelivery(event.deliveryId,{runId,sessionId:binding.sessionId});if(binding.activeRunId===undefined){binding.activeRunId=runId;this.deps.runs.start(binding.sessionId,runId,event.text??"")}else binding.queue.push({deliveryId:event.deliveryId,text:event.text??"",runId});this.deps.output.post(event.address,`accepted:${event.deliveryId}`,{text:binding.activeRunId===runId?`Accepted as run ${runId}.`:`Queued as run ${runId}; it will start at the next turn boundary.`});return{status:200 as const,body:JSON.stringify({runId,sessionId:binding.sessionId,queued:binding.activeRunId!==runId})}}
  /** Called only after the worker durably settles a provider turn. */
  turnBoundary(address:ConversationAddress,completedRunId:RunId){const binding=this.deps.state.binding(addressKey(address));if(binding?.activeRunId!==completedRunId)return;const next=binding.queue.shift();if(next===undefined){delete binding.activeRunId;return}binding.activeRunId=next.runId;this.deps.runs.start(binding.sessionId,next.runId,next.text)}
  project(address:ConversationAddress,events:ReadonlyArray<PublicRunEvent>){const key=addressKey(address);let cursor=this.deps.state.cursor(key);for(const event of events){if(event.cursor<=cursor)continue;const projected=projectPublicRunEvent(event);if(projected?._tag==="Approval"){this.deps.state.setApproval(projected.approvalId,{runId:event.runId,addressKey:key,actor:this.deps.state.binding(key)?.actor??""});this.deps.state.postOnce(`approval:${projected.approvalId}`,()=>this.deps.output.post(address,`approval:${projected.approvalId}`,{text:projected.summary,card:{approvalId:projected.approvalId,approveAction:"approve",denyAction:"deny"}}))}else if(projected!==undefined)this.deps.state.postOnce(`${projected._tag}:${event.runId}:${event.cursor}`,()=>this.deps.output.post(address,`${projected._tag}:${event.runId}:${event.cursor}`,{text:projected.text}));cursor=event.cursor;this.deps.state.setCursor(key,cursor)}}
  private resolve(event:VerifiedChatEvent){const approval=event.approvalId===undefined?undefined:this.deps.state.approval(event.approvalId);if(approval===undefined||approval.addressKey!==addressKey(event.address)||approval.actor!==event.actor||approval.resolved!==undefined||event.decision===undefined)return{status:200 as const,body:"ignored"};approval.resolved=event.decision;this.deps.runs.resumeApproval(approval.runId,event.approvalId!,event.decision);this.deps.state.postOnce(`approval-resolution:${event.approvalId}`,()=>this.deps.output.post(event.address,`approval-resolution:${event.approvalId}`,{text:`Approval ${event.decision}.`}));return{status:200 as const,body:"resolved"}}
}
