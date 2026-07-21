import { ProductAnalyticsRepository, type ProductAnalyticsEnvelope } from "@proxus/backend-domain/product-analytics"
import { Context, Effect, Layer, Ref } from "effect"

export class ProductAnalyticsMemoryStore extends Context.Service<ProductAnalyticsMemoryStore, {
  readonly rows: Effect.Effect<ReadonlyArray<ProductAnalyticsEnvelope>>
}>()("@proxus/backend-infra/modules/product-analytics/repository.memory/ProductAnalyticsMemoryStore") {}

/** Fresh and scoped to each Layer construction. The test/dev adapter never silently evicts rows. */
export const ProductAnalyticsRepositoryMemory = Layer.effectContext(Effect.gen(function*() {
  const rows = yield* Ref.make<ReadonlyArray<ProductAnalyticsEnvelope>>([])
  const store = ProductAnalyticsMemoryStore.of({ rows: Ref.get(rows) })
  const repository = ProductAnalyticsRepository.of({
    writeBatch: (batch) => Ref.update(rows, (current) => [...current, ...batch]),
  })
  return Context.make(ProductAnalyticsRepository, repository).pipe(Context.add(ProductAnalyticsMemoryStore, store))
}))
