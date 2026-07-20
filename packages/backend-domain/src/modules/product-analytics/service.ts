import type { PublicProductAnalyticsEvent } from "@proxus/shared/product-analytics"
import { Array, Context, Effect } from "effect"
import type { ProductAnalyticsContext, ProductAnalyticsRecordResult } from "./model.js"

export class ProductAnalytics extends Context.Service<ProductAnalytics, {
  readonly recordBatch: (
    events: Array.NonEmptyReadonlyArray<PublicProductAnalyticsEvent>,
    context: ProductAnalyticsContext,
  ) => Effect.Effect<ProductAnalyticsRecordResult>
}>()("@proxus/backend-domain/modules/product-analytics/service/ProductAnalytics") {}
