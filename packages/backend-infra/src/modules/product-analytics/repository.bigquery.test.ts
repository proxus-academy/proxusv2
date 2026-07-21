import { describe, expect, test } from "vitest"
import {
  bigQueryInsertOptions,
  normalizeBigQueryPartialFailure,
} from "./repository.bigquery.js"

const partialFailure = (errors: ReadonlyArray<unknown>) => ({
  name: "PartialFailureError",
  errors,
})

const rowFailure = (
  insertId: string,
  reasons: ReadonlyArray<string>,
) => ({
  row: { insertId },
  errors: reasons.map((reason) => ({ reason })),
})

describe("ProductAnalyticsRepository BigQuery", () => {
  test("disables SDK-owned partial retries", () => {
    expect(bigQueryInsertOptions).toEqual({ raw: true, partialRetries: 0 })
  })

  test("returns unique, bounded retry indexes that are a failed-row subset", () => {
    const normalized = normalizeBigQueryPartialFailure(
      partialFailure([
        rowFailure("event-2", ["backendError"]),
        rowFailure("event-1", ["rateLimitExceeded"]),
        rowFailure("event-1", ["invalid"]),
        rowFailure("event-2", ["internalError"]),
      ]),
      ["event-1", "event-2", "event-3"],
    )

    expect(normalized).toEqual({
      failedIndexes: [0, 1],
      retryableIndexes: [1],
    })
  })

  test("fails the batch closed without retrying unknown or ambiguous rows", () => {
    expect(normalizeBigQueryPartialFailure(
      partialFailure([rowFailure("unknown", ["backendError"])]),
      ["event-1", "event-2"],
    )).toEqual({ failedIndexes: [0, 1], retryableIndexes: [] })

    expect(normalizeBigQueryPartialFailure(
      partialFailure([rowFailure("duplicate", ["backendError"])]),
      ["duplicate", "duplicate"],
    )).toEqual({ failedIndexes: [0, 1], retryableIndexes: [] })
  })
})
