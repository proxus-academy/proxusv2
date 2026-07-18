import type { ProductAnalyticsEvent } from "@proxus/shared/product-analytics"

export interface ProductAnalyticsContext {
  readonly consent: "granted" | "denied" | "unknown"
  /** Server-issued pseudonym; never supplied by the analytics request body. */
  readonly analyticsSubjectId?: string
  readonly sessionId?: string
}
export interface ProductAnalyticsEnvelope {
  readonly eventId: string
  readonly receivedAt: string
  readonly occurredAt?: string
  readonly subjectId?: string
  readonly sessionId?: string
  readonly event: ProductAnalyticsEvent
}
export type ProductAnalyticsRejectionReason = "no-consent" | "invalid" | "full" | "closed"

/** Admission is atomic: a batch is either wholly accepted or wholly rejected with a reason. */
export type ProductAnalyticsRecordResult =
  | { readonly accepted: number; readonly rejected: 0; readonly reason?: never }
  | { readonly accepted: 0; readonly rejected: number; readonly reason: ProductAnalyticsRejectionReason }
