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
  const config: BigQueryConfig = { projectId, dataset, table, ...(key._tag === "Some" ? { keyFilename: Redacted.value(key.value) } : undefined) }
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
export const bigQueryInsertOptions = {
  raw: true,
  // Retry ownership belongs to ProductAnalyticsLive so IDs, budgets and shutdown
  // are controlled in one place rather than by a hidden SDK retry loop.
  partialRetries: 0,
} as const

export const normalizeBigQueryPartialFailure = (
  cause: unknown,
  eventIds: ReadonlyArray<string>,
) => {
  if (
    typeof cause !== "object" ||
    cause === null ||
    !("name" in cause) ||
    cause.name !== "PartialFailureError" ||
    !("errors" in cause) ||
    !Array.isArray(cause.errors)
  ) return undefined

  const indexByEventId = new Map<string, number>()
  for (const [index, eventId] of eventIds.entries()) {
    indexByEventId.set(
      eventId,
      indexByEventId.has(eventId) ? -1 : index,
    )
  }
  const retryableByIndex = new Map<number, boolean>()
  let allRowsKnown = cause.errors.length > 0
  for (const failure of cause.errors) {
    if (typeof failure !== "object" || failure === null || !("row" in failure)) {
      allRowsKnown = false
      continue
    }
    const row = failure.row
    const insertId = typeof row === "object" && row !== null && "insertId" in row
      ? row.insertId
      : undefined
    const index = typeof insertId === "string"
      ? indexByEventId.get(insertId)
      : undefined
    if (index === undefined || index < 0 || index >= eventIds.length) {
      allRowsKnown = false
      continue
    }
    const errors: ReadonlyArray<unknown> = "errors" in failure &&
        Array.isArray(failure.errors)
      ? failure.errors
      : []
    const rowIsRetryable = errors.length > 0 && errors.every((error) =>
      typeof error === "object" &&
      error !== null &&
      "reason" in error &&
      typeof error.reason === "string" &&
      retryableReasons.has(error.reason)
    )
    retryableByIndex.set(
      index,
      (retryableByIndex.get(index) ?? true) && rowIsRetryable,
    )
  }

  // Unknown or ambiguous row identities are fail-closed: retrying the complete
  // batch could duplicate rows which BigQuery already accepted.
  if (!allRowsKnown) {
    return {
      failedIndexes: eventIds.map((_, index) => index),
      retryableIndexes: [],
    }
  }
  const failedIndexes = [...retryableByIndex.keys()].sort((left, right) =>
    left - right,
  )
  return {
    failedIndexes,
    retryableIndexes: failedIndexes.filter((index) =>
      retryableByIndex.get(index) === true,
    ),
  }
}
export const ProductAnalyticsRepositoryBigQuery = Layer.effect(ProductAnalyticsRepository, Effect.gen(function*() {
  const config = yield* loadConfig
  // BigQuery's Node client exposes no close operation. It is still constructed once per Layer,
  // but there is no SDK resource finalizer to invoke (an explicit production limitation).
  const client = new BigQuery({ projectId: config.projectId, ...(config.keyFilename === undefined ? undefined : { keyFilename: config.keyFilename }) })
  const table = client.dataset(config.dataset).table(config.table)
  return ProductAnalyticsRepository.of({
    writeBatch: (batch) => Effect.tryPromise({
      try: () => table.insert(
        batch.map((envelope) => ({
          insertId: envelope.eventId,
          json: envelope,
        })),
        bigQueryInsertOptions,
      ),
      catch: (cause) => {
        const partial = normalizeBigQueryPartialFailure(
          cause,
          batch.map(({ eventId }) => eventId),
        )
        return new ProductAnalyticsRepositoryError({
          operation: "insert",
          retryable: partial === undefined ? retryable(cause) : partial.retryableIndexes.length > 0,
          cause,
          ...(partial === undefined ? undefined : partial),
        })
      },
    }).pipe(Effect.asVoid),
  })
}))
