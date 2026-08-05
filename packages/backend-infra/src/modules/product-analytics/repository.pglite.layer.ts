import { ProductAnalyticsRepository } from "@proxus/backend-domain/product-analytics"
import * as PgliteDrizzle from "drizzle-orm/effect-pglite"
import { Effect, Layer } from "effect"
import { makeProductAnalyticsRepositoryDrizzle } from "./repository.drizzle.js"

export const ProductAnalyticsRepositoryPgliteLive = Layer.effect(
  ProductAnalyticsRepository,
  PgliteDrizzle.makeWithDefaults().pipe(Effect.map(makeProductAnalyticsRepositoryDrizzle)),
)
