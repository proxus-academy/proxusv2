import type { ProductAnalyticsEvent } from "@proxus/shared/product-analytics"
import { Context, Effect } from "effect"
import type { ProductAnalyticsContext, ProductAnalyticsRecordResult } from "./model.js"

export class ProductAnalytics extends Context.Service<ProductAnalytics, {
  readonly recordBatch: (events: ReadonlyArray<ProductAnalyticsEvent>, context: ProductAnalyticsContext) => Effect.Effect<ProductAnalyticsRecordResult>
}>()("@proxus/backend-domain/modules/product-analytics/service/ProductAnalytics") {}
