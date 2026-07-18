import { ProductAnalyticsLive } from "@proxus/backend-domain/product-analytics"
import { ProductAnalyticsRepositoryBigQuery } from "@proxus/backend-infra/product-analytics/bigquery"
import { ProductAnalyticsHttpContextFailClosed } from "@proxus/backend-transport/product-analytics"
import { Layer } from "effect"

/**
 * Production persistence is strict BigQuery (no memory fallback). Ingestion remains
 * fail-closed until approved consent/session middleware replaces this context layer.
 */
export const ProductAnalyticsProdLive = Layer.mergeAll(
  ProductAnalyticsLive.pipe(Layer.provide(ProductAnalyticsRepositoryBigQuery)),
  ProductAnalyticsHttpContextFailClosed,
)
