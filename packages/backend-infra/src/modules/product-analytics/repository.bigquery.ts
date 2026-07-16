import { BigQuery } from "@google-cloud/bigquery"
import { ProductAnalyticsRepository, ProductAnalyticsRepositoryError } from "@proxus/backend-domain/product-analytics"
import { Config, Effect, Layer, Redacted } from "effect"

interface BigQueryConfig { readonly projectId: string; readonly dataset: string; readonly table: string; readonly keyFilename?: string }
const identifier = /^[A-Za-z_][A-Za-z0-9_]{0,1023}$/
const projectIdentifier = /^[a-z][a-z0-9.-]{4,61}[a-z0-9]$/
const loadConfig = Effect.gen(function*() {
  const projectId = yield* Config.string("PRODUCT_ANALYTICS_BIGQUERY_PROJECT")
  const dataset = yield* Config.string("PRODUCT_ANALYTICS_BIGQUERY_DATASET")
  const table = yield* Config.string("PRODUCT_ANALYTICS_BIGQUERY_TABLE")
  const key = yield* Config.option(Config.redacted("PRODUCT_ANALYTICS_BIGQUERY_KEY_FILE"))
  const config: BigQueryConfig = { projectId, dataset, table, ...(key._tag === "Some" ? { keyFilename: Redacted.value(key.value) } : {}) }
  if (!projectIdentifier.test(projectId) || !identifier.test(dataset) || !identifier.test(table) || config.keyFilename?.trim() === "") {
    return yield* Effect.die("Invalid Product Analytics BigQuery configuration")
  }
  return config
})
const retryableReasons = new Set(["backendError", "internalError", "rateLimitExceeded", "jobRateLimitExceeded"])
const retryable = (cause: unknown) => {
  const code = typeof cause === "object" && cause !== null && "code" in cause ? Number(cause.code) : NaN
  return code === 408 || code === 429 || code >= 500
}
const partialFailure = (cause: unknown, eventIds: ReadonlyArray<string>) => {
  if (typeof cause !== "object" || cause === null || !("name" in cause) || cause.name !== "PartialFailureError" || !("errors" in cause) || !Array.isArray(cause.errors)) return undefined
  const failedIndexes: Array<number> = []
  const retryableIndexes: Array<number> = []
  const failures: ReadonlyArray<unknown> = cause.errors
  for (const failure of failures) {
    if (typeof failure !== "object" || failure === null || !("row" in failure)) continue
    const row = failure.row
    const insertId = typeof row === "object" && row !== null && "insertId" in row ? row.insertId : undefined
    const index = typeof insertId === "string" ? eventIds.indexOf(insertId) : -1
    if (index < 0) continue
    failedIndexes.push(index)
    const errors: ReadonlyArray<unknown> = "errors" in failure && Array.isArray(failure.errors) ? failure.errors : []
    if (errors.length > 0 && errors.every((error: unknown) => typeof error === "object" && error !== null && "reason" in error && typeof error.reason === "string" && retryableReasons.has(error.reason))) retryableIndexes.push(index)
  }
  // Unknown row identities are fail-closed: account for the complete batch as permanently failed,
  // rather than retrying rows which BigQuery may already have accepted.
  return failedIndexes.length === cause.errors.length
    ? { failedIndexes, retryableIndexes }
    : { failedIndexes: eventIds.map((_, index) => index), retryableIndexes: [] }
}
export const ProductAnalyticsRepositoryBigQuery = Layer.effect(ProductAnalyticsRepository, Effect.gen(function*() {
  const config = yield* loadConfig
  // BigQuery's Node client exposes no close operation. It is still constructed once per Layer,
  // but there is no SDK resource finalizer to invoke (an explicit production limitation).
  const client = new BigQuery({ projectId: config.projectId, ...(config.keyFilename === undefined ? {} : { keyFilename: config.keyFilename }) })
  const table = client.dataset(config.dataset).table(config.table)
  return ProductAnalyticsRepository.of({
    writeBatch: (batch) => Effect.tryPromise({
      try: () => table.insert(batch.map((envelope) => ({ insertId: envelope.eventId, json: envelope })), { raw: true }),
      catch: (cause) => {
        const partial = partialFailure(cause, batch.map(({ eventId }) => eventId))
        return new ProductAnalyticsRepositoryError({
          operation: "insert",
          retryable: partial === undefined ? retryable(cause) : partial.retryableIndexes.length > 0,
          cause,
          ...(partial === undefined ? {} : partial),
        })
      },
    }).pipe(Effect.asVoid),
  })
}))
