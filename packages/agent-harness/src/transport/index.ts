import type { RunId, SessionId } from "../ids.js"

/** Stable transport-neutral address. Vendor resource names belong in adapters. */
export interface ConversationAddress { readonly tenant: string; readonly conversation: string; readonly thread: string }
export interface AcceptedInput { readonly deliveryId: string; readonly sessionId: SessionId; readonly runId: RunId; readonly queued: boolean }

export type PublicRunEvent =
  | { readonly cursor: number; readonly runId: RunId; readonly type: "RunAccepted" | "TurnStarted"; readonly detail?: string }
  | { readonly cursor: number; readonly runId: RunId; readonly type: "ChildStarted" | "ChildCompleted"; readonly childRunId: RunId; readonly detail?: string }
  | { readonly cursor: number; readonly runId: RunId; readonly type: "ApprovalRequested"; readonly approvalId: string; readonly summary: string }
  | { readonly cursor: number; readonly runId: RunId; readonly type: "ApprovalResolved"; readonly approvalId: string; readonly decision: "approved" | "denied" }
  | { readonly cursor: number; readonly runId: RunId; readonly type: "RunCompleted"; readonly output: string }
  | { readonly cursor: number; readonly runId: RunId; readonly type: "RunFailed"; readonly detail: string }

export type ProgressProjection =
  | { readonly _tag: "Progress"; readonly text: string }
  | { readonly _tag: "Approval"; readonly approvalId: string; readonly summary: string }
  | { readonly _tag: "Final"; readonly text: string }

/** Safe allowlist projection: raw model/DSL content is deliberately not accepted. */
export const projectPublicRunEvent = (event: PublicRunEvent): ProgressProjection | undefined => {
  switch (event.type) {
    case "RunAccepted": return { _tag: "Progress", text: "Request accepted." }
    case "TurnStarted": return { _tag: "Progress", text: `Working${event.detail === undefined ? "" : `: ${event.detail}`}.` }
    case "ChildStarted": return { _tag: "Progress", text: `Started delegated work${event.detail === undefined ? "" : `: ${event.detail}`}.` }
    case "ChildCompleted": return { _tag: "Progress", text: "Delegated work completed." }
    case "ApprovalRequested": return { _tag: "Approval", approvalId: event.approvalId, summary: event.summary }
    case "ApprovalResolved": return { _tag: "Progress", text: `Approval ${event.decision}.` }
    case "RunCompleted": return { _tag: "Final", text: event.output }
    case "RunFailed": return { _tag: "Final", text: `The request failed safely: ${event.detail}` }
  }
}
