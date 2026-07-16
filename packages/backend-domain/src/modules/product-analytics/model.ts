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
export interface ProductAnalyticsRecordResult {
  readonly accepted: number
  readonly rejected: number
  readonly reason?: "no-consent" | "invalid" | "full" | "closed"
}
