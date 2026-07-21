import { ProductAnalyticsLive } from "@proxus/backend-domain/product-analytics"
import { ProductAnalyticsRepositoryMemory } from "@proxus/backend-infra/product-analytics/memory"
import { ProductAnalyticsHttpContextDevelopment } from "@proxus/backend-transport/product-analytics"
import { Layer } from "effect"

export const ProductAnalyticsDevLive = Layer.mergeAll(
  ProductAnalyticsLive.pipe(Layer.provide(ProductAnalyticsRepositoryMemory)),
  ProductAnalyticsHttpContextDevelopment,
)
