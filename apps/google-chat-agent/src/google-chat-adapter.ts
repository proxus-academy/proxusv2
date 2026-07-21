// @effect-diagnostics nodeBuiltinImport:off
import { createHmac, timingSafeEqual } from "node:crypto"
import type { VerifiedChatEvent, WebhookAuthenticator, WebhookRequest } from "./app.js"

/** Google-specific HTTP/signature decoding stays at the app edge. Deployments may replace this with Google token verification. */
export class SignedGoogleChatWebhook implements WebhookAuthenticator {
  constructor(private readonly secret:string){}
  verify(request:WebhookRequest):VerifiedChatEvent{const supplied=request.headers["x-proxus-signature"]??"";const expected=createHmac("sha256",this.secret).update(request.body).digest("hex");const a=Buffer.from(supplied);const b=Buffer.from(expected);if(a.length!==b.length||!timingSafeEqual(a,b))throw new Error("invalid signature");const wire=JSON.parse(request.body) as {deliveryId:string;tenant:string;space:string;thread:string;actor:string;type:"MESSAGE"|"CARD_CLICKED";text?:string;approvalId?:string;decision?:"approved"|"denied"};return{deliveryId:wire.deliveryId,address:{tenant:wire.tenant,conversation:wire.space,thread:wire.thread},actor:wire.actor,kind:wire.type==="MESSAGE"?"message":"approval",...(wire.text===undefined?{}:{text:wire.text}),...(wire.approvalId===undefined?{}:{approvalId:wire.approvalId}),...(wire.decision===undefined?{}:{decision:wire.decision})}}
}
