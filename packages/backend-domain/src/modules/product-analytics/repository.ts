import { Array, Context, Effect, Schema } from "effect"
import type { ProductAnalyticsEnvelope } from "./model.js"

export class ProductAnalyticsRepositoryError extends Schema.TaggedErrorClass<ProductAnalyticsRepositoryError>()(
  "ProductAnalyticsRepositoryError",
  {
    operation: Schema.String,
    retryable: Schema.Boolean,
    cause: Schema.Defect(),
    /** Indexes within the submitted batch. Omitted for a whole-request failure. */
    failedIndexes: Schema.optional(Schema.Array(Schema.Int)),
    /** Failed indexes safe to retry. Omitted when `retryable` applies to the whole failure. */
    retryableIndexes: Schema.optional(Schema.Array(Schema.Int)),
  },
) {}
export class ProductAnalyticsRepository extends Context.Service<ProductAnalyticsRepository, {
  readonly writeBatch: (
    batch: Array.NonEmptyReadonlyArray<ProductAnalyticsEnvelope>,
  ) => Effect.Effect<void, ProductAnalyticsRepositoryError>
}>()("@proxus/backend-domain/modules/product-analytics/repository/ProductAnalyticsRepository") {}
