import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { PublicProductAnalyticsEvent } from "./events.js"

export class RecordProductAnalyticsBatchRequest extends Schema.Class<RecordProductAnalyticsBatchRequest>("RecordProductAnalyticsBatchRequest")({
  events: Schema.Array(PublicProductAnalyticsEvent).pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(50))),
}) {}
export class RecordProductAnalyticsBatchResponse extends Schema.Class<RecordProductAnalyticsBatchResponse>("RecordProductAnalyticsBatchResponse")({
  accepted: Schema.Int,
  rejected: Schema.Int,
  reason: Schema.optional(Schema.Literals(["no-consent", "invalid", "full", "closed"])),
}) {}
export class PublicProductAnalyticsApi extends HttpApiGroup.make("productAnalytics", { topLevel: true }).add(
  HttpApiEndpoint.post("recordBatch", "/product-analytics/events", {
    payload: RecordProductAnalyticsBatchRequest,
    success: RecordProductAnalyticsBatchResponse,
  }),
) {}
