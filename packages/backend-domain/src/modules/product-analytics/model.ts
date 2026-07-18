import type { ProductAnalyticsEvent } from "@proxus/shared/product-analytics"

export interface ProductAnalyticsContext {
  readonly consent: "granted" | "denied" | "unknown"
  /** Stable flag subject resolved by trusted transport/auth middleware, never by the event body. */
  readonly flagSubjectId?: string
  readonly sessionId?: string
}
export interface ProductAnalyticsEnvelope {
  readonly eventId: string
  readonly receivedAt: string
  readonly occurredAt?: string
  readonly subjectId: string
  readonly sessionId?: string
  readonly flagKey: string
  readonly variant: string
  readonly revision: number
  readonly event: ProductAnalyticsEvent
}
export type ProductAnalyticsRejectionReason = "no-consent" | "invalid" | "full" | "closed"

/** Admission is atomic: a batch is either wholly accepted or wholly rejected with a reason. */
export type ProductAnalyticsRecordResult =
  | { readonly accepted: number; readonly rejected: 0; readonly reason?: never }
  | { readonly accepted: 0; readonly rejected: number; readonly reason: ProductAnalyticsRejectionReason }
