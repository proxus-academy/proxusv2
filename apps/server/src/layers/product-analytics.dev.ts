import { ProductAnalyticsLive } from "@proxus/backend-domain/product-analytics"
import { ProductAnalyticsRepositoryPgliteLive } from "@proxus/backend-infra/product-analytics/pglite"
import { PgliteDevelopmentLive, PgliteMigrationLive } from "@proxus/backend-infra/database/pglite"
import { ProductAnalyticsHttpContextDevelopment } from "@proxus/backend-transport/product-analytics"
import { Layer } from "effect"

const PersistenceLive = Layer.merge(PgliteMigrationLive, ProductAnalyticsRepositoryPgliteLive)
  .pipe(Layer.provide(PgliteDevelopmentLive))

export const ProductAnalyticsDevLive = Layer.mergeAll(
  ProductAnalyticsLive.pipe(Layer.provide(PersistenceLive)),
  ProductAnalyticsHttpContextDevelopment,
)
