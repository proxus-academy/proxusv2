import { ProductAnalytics, ProductAnalyticsRepository, makeProductAnalyticsLive } from "@proxus/backend-domain/product-analytics"
import { Context, DateTime, Effect, Layer } from "effect"
import { describe, expect, test } from "vitest"
import { ProductAnalyticsMemoryStore, ProductAnalyticsRepositoryMemory } from "./repository.memory.js"

const ServiceLive = makeProductAnalyticsLive({
  queueCapacity: 2, batchSize: 10, flushIntervalMs: 1,
  shutdownTimeoutMs: 100, maxRetries: 1, retryBaseDelayMs: 1,
  maximumPastSkewMs: 1_000, maximumFutureSkewMs: 1_000,
})
const event = { _tag: "registration_cta_clicked", flagKey: "registration.cta", configurationRevision: 1, allocationVersion: 1, reportedVariant: "control" } as const
const run = <A>(program: Effect.Effect<A, never, ProductAnalytics | ProductAnalyticsMemoryStore>) =>
  Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const memory = yield* Layer.build(ProductAnalyticsRepositoryMemory)
    const service = yield* Layer.build(ServiceLive.pipe(Layer.provide(
      Layer.succeed(ProductAnalyticsRepository, Context.get(memory, ProductAnalyticsRepository)),
    )))
    return yield* program.pipe(Effect.provide(Context.merge(memory, service)))
  })))

describe("ProductAnalyticsLive", () => {
  test("fails closed before consent without creating a backlog", () => run(Effect.gen(function*() {
    const analytics = yield* ProductAnalytics
    const result = yield* analytics.recordBatch([event], { consent: "unknown" })
    expect(result).toEqual({ accepted: 0, rejected: 1, reason: "no-consent" })
    yield* Effect.sleep(5)
    expect(yield* (yield* ProductAnalyticsMemoryStore).rows).toEqual([])
  })))

  test("rejects timestamps outside the accepted skew", () => run(Effect.gen(function*() {
    const analytics = yield* ProductAnalytics
    const stale = { ...event, occurredAt: DateTime.makeUnsafe(0) }
    expect(yield* analytics.recordBatch([stale], { consent: "granted" })).toEqual({ accepted: 0, rejected: 1, reason: "invalid" })
  })))

  test("rejects a mixed-validity batch atomically", () => run(Effect.gen(function*() {
    const analytics = yield* ProductAnalytics
    const stale = { ...event, occurredAt: DateTime.makeUnsafe(0) }
    expect(yield* analytics.recordBatch([event, stale], { consent: "granted" })).toEqual({ accepted: 0, rejected: 2, reason: "invalid" })
    yield* Effect.sleep(5)
    expect(yield* (yield* ProductAnalyticsMemoryStore).rows).toEqual([])
  })))

  test("accepts a frontend-only exposure without backend reevaluation", () => run(Effect.gen(function*() {
    const analytics = yield* ProductAnalytics
    const exposure = { _tag: "feature_flag_exposed", flagKey: "registration.cta", configurationRevision: 1, allocationVersion: 1, reportedVariant: "control" } as const
    expect(yield* analytics.recordBatch([exposure], { consent: "granted" })).toEqual({ accepted: 1, rejected: 0 })
  })))

  test("admits then persists a consented batch through the repository", () => run(Effect.gen(function*() {
    const analytics = yield* ProductAnalytics
    expect(yield* analytics.recordBatch([event], { consent: "granted" })).toEqual({ accepted: 1, rejected: 0 })
    yield* Effect.sleep(10)
    const rows = yield* (yield* ProductAnalyticsMemoryStore).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]?.eventId).toMatch(/^[0-9a-f-]{36}$/)
  })))
})
