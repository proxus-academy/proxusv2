import {
  ProductAnalytics,
  ProductAnalyticsRepository,
  ProductAnalyticsRepositoryError,
  makeProductAnalyticsLive,
} from "@proxus/backend-domain/product-analytics"
import {
  FeatureFlagExposed,
  RegistrationStarted,
} from "@proxus/shared/product-analytics"
import {
  Context,
  DateTime,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Ref,
  Scope,
} from "effect"
import { TestClock } from "effect/testing"
import { describe, expect, test } from "vitest"
import {
  ProductAnalyticsMemoryStore,
  ProductAnalyticsRepositoryMemory,
} from "./repository.memory.js"

const options = {
  queueCapacity: 2,
  batchSize: 10,
  flushIntervalMs: 10,
  shutdownTimeoutMs: 50,
  maxRetries: 1,
  retryBaseDelayMs: 10,
  maximumPastSkewMs: 1_000,
  maximumFutureSkewMs: 1_000,
} as const
const ServiceLive = makeProductAnalyticsLive(options)
const event = new RegistrationStarted({
  flagKey: "registration.landing",
  revision: 0,
  variant: "short",
})
const run = <A>(
  program: Effect.Effect<
    A,
    never,
    ProductAnalytics | ProductAnalyticsMemoryStore
  >,
) =>
  Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    yield* TestClock.setTime(10_000)
    const memory = yield* Layer.build(ProductAnalyticsRepositoryMemory)
    const service = yield* Layer.build(ServiceLive.pipe(Layer.provide(
      Layer.succeed(
        ProductAnalyticsRepository,
        Context.get(memory, ProductAnalyticsRepository),
      ),
    )))
    return yield* program.pipe(Effect.provide(Context.merge(memory, service)))
  })).pipe(
    // Test entry point owns the virtual clock Layer.
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(TestClock.layer()),
  ))

const staleEvent = () => new RegistrationStarted({
  flagKey: event.flagKey,
  revision: event.revision,
  variant: event.variant,
  occurredAt: DateTime.makeUnsafe(0),
})

const grantedContext = {
  consent: "granted",
  flagSubjectId: "00000000-0000-4000-8000-000000000001",
} as const

describe("ProductAnalyticsLive", () => {
  test("fails closed before consent without creating a backlog", () =>
    run(Effect.gen(function*() {
      const analytics = yield* ProductAnalytics
      const result = yield* analytics.recordBatch([event], {
        consent: "unknown",
      })
      expect(result).toEqual({
        accepted: 0,
        rejected: 1,
        reason: "no-consent",
      })
      expect(yield* (yield* ProductAnalyticsMemoryStore).rows).toEqual([])
    })))

  test("rejects timestamps outside the accepted skew", () =>
    run(Effect.gen(function*() {
      const analytics = yield* ProductAnalytics
      expect(yield* analytics.recordBatch(
        [staleEvent()],
        grantedContext,
      )).toEqual({ accepted: 0, rejected: 1, reason: "invalid" })
    })))

  test("rejects a mixed-validity batch atomically", () =>
    run(Effect.gen(function*() {
      const analytics = yield* ProductAnalytics
      expect(yield* analytics.recordBatch(
        [event, staleEvent()],
        grantedContext,
      )).toEqual({ accepted: 0, rejected: 2, reason: "invalid" })
      expect(yield* (yield* ProductAnalyticsMemoryStore).rows).toEqual([])
    })))

  test("accepts only the local short default at synthetic revision zero", () =>
    run(Effect.gen(function*() {
      const analytics = yield* ProductAnalytics
      const contextWithLongHash = {
        ...grantedContext,
        flagSubjectId: "00000000-0000-4000-8000-000000000002",
      }
      const exposure = new FeatureFlagExposed({
        flagKey: "registration.landing",
        revision: 0,
        variant: "short",
      })
      expect(yield* analytics.recordBatch(
        [exposure],
        contextWithLongHash,
      )).toEqual({ accepted: 1, rejected: 0 })
      expect(yield* analytics.recordBatch(
        [new FeatureFlagExposed({ ...exposure, variant: "long" })],
        contextWithLongHash,
      )).toEqual({ accepted: 0, rejected: 1, reason: "invalid" })
    })))

  test("drains a queued batch with its envelope when the service scope closes", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const memory = yield* Layer.build(ProductAnalyticsRepositoryMemory)
      const slowService = makeProductAnalyticsLive({
        ...options,
        flushIntervalMs: 60_000,
      }).pipe(Layer.provide(Layer.succeed(
        ProductAnalyticsRepository,
        Context.get(memory, ProductAnalyticsRepository),
      )))

      yield* Effect.scoped(Effect.gen(function*() {
        const service = yield* Layer.build(slowService)
        const analytics = Context.get(service, ProductAnalytics)
        expect(yield* analytics.recordBatch(
          [event],
          grantedContext,
        )).toEqual({ accepted: 1, rejected: 0 })
      }))

      const rows = yield* Context.get(memory, ProductAnalyticsMemoryStore).rows
      expect(rows).toHaveLength(1)
      expect(rows[0]?.eventId).toMatch(/^[0-9a-f-]{36}$/)
      expect(rows[0]?.event).toEqual(event)
    }))))

  test("bounds shutdown when the repository remains blocked", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const firstStarted = yield* Deferred.make<void>()
      const shutdownDrainStarted = yield* Deferred.make<void>()
      const blocker = yield* Deferred.make<void>()
      const attempts = yield* Ref.make(0)
      const repository = ProductAnalyticsRepository.of({
        writeBatch: () => Effect.gen(function*() {
          const attempt = yield* Ref.updateAndGet(
            attempts,
            (current) => current + 1,
          )
          yield* Deferred.succeed(
            attempt === 1 ? firstStarted : shutdownDrainStarted,
            undefined,
          )
          return yield* Deferred.await(blocker)
        }),
      })
      const scope = yield* Scope.make()
      const context = yield* Layer.buildWithScope(
        makeProductAnalyticsLive(options).pipe(Layer.provide(
          Layer.succeed(ProductAnalyticsRepository, repository),
        )),
        scope,
      )
      const analytics = Context.get(context, ProductAnalytics)
      expect(yield* analytics.recordBatch([event], grantedContext)).toEqual({
        accepted: 1,
        rejected: 0,
      })

      yield* TestClock.adjust(options.flushIntervalMs)
      yield* Deferred.await(firstStarted)
      const closeFiber = yield* Effect.forkChild(
        Scope.close(scope, Exit.void),
        { startImmediately: true },
      )
      yield* Deferred.await(shutdownDrainStarted)
      yield* TestClock.adjust(options.shutdownTimeoutMs)
      yield* Fiber.join(closeFiber)

      expect(yield* Ref.get(attempts)).toBe(2)
      expect(yield* analytics.recordBatch([event], grantedContext)).toEqual({
        accepted: 0,
        rejected: 1,
        reason: "closed",
      })
    })).pipe(
      // Test entry point owns the virtual clock Layer.
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(TestClock.layer()),
    )))

  test("includes retry backoff in the shutdown deadline", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const attemptStarted = yield* Deferred.make<void>()
      const attempts = yield* Ref.make(0)
      const repositoryFailure = new ProductAnalyticsRepositoryError({
        operation: "test",
        retryable: true,
        cause: "transient",
      })
      const repository = ProductAnalyticsRepository.of({
        writeBatch: () => Ref.updateAndGet(
          attempts,
          (current) => current + 1,
        ).pipe(
          Effect.tap(() => Deferred.succeed(attemptStarted, undefined)),
          Effect.andThen(Effect.fail(repositoryFailure)),
        ),
      })
      const scope = yield* Scope.make()
      const context = yield* Layer.buildWithScope(
        makeProductAnalyticsLive({
          ...options,
          flushIntervalMs: 60_000,
          retryBaseDelayMs: 1_000,
          maxRetries: 10,
        }).pipe(Layer.provide(
          Layer.succeed(ProductAnalyticsRepository, repository),
        )),
        scope,
      )
      const analytics = Context.get(context, ProductAnalytics)
      yield* analytics.recordBatch([event], grantedContext)

      const closeFiber = yield* Effect.forkChild(
        Scope.close(scope, Exit.void),
        { startImmediately: true },
      )
      yield* Deferred.await(attemptStarted)
      yield* TestClock.adjust(options.shutdownTimeoutMs)
      yield* Fiber.join(closeFiber)

      expect(yield* Ref.get(attempts)).toBe(1)
    })).pipe(
      // Test entry point owns the virtual clock Layer.
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(TestClock.layer()),
    )))

  test("normalizes malformed partial retry indexes before retrying", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const firstAttempt = yield* Deferred.make<void>()
      const retryCompleted = yield* Deferred.make<void>()
      const attempts = yield* Ref.make<ReadonlyArray<ReadonlyArray<string>>>([])
      const repository = ProductAnalyticsRepository.of({
        writeBatch: (batch) => Effect.gen(function*() {
          yield* Ref.update(attempts, (current) => [
            ...current,
            batch.map(({ eventId }) => eventId),
          ])
          const attempt = (yield* Ref.get(attempts)).length
          if (attempt === 1) {
            yield* Deferred.succeed(firstAttempt, undefined)
            return yield* new ProductAnalyticsRepositoryError({
              operation: "test-partial",
              retryable: true,
              cause: "partial",
              failedIndexes: [0, 0, 99],
              retryableIndexes: [0, 1, 1, 99],
            })
          }
          yield* Deferred.succeed(retryCompleted, undefined)
        }),
      })
      const scope = yield* Scope.make()
      const context = yield* Layer.buildWithScope(
        makeProductAnalyticsLive(options).pipe(Layer.provide(
          Layer.succeed(ProductAnalyticsRepository, repository),
        )),
        scope,
      )
      const analytics = Context.get(context, ProductAnalytics)
      const revisionOne = new RegistrationStarted({
        flagKey: "registration.landing",
        revision: 1,
        variant: "long",
      })
      yield* analytics.recordBatch([event, revisionOne], grantedContext)

      yield* TestClock.adjust(options.flushIntervalMs)
      yield* Deferred.await(firstAttempt)
      yield* TestClock.adjust(options.retryBaseDelayMs * 2)
      yield* Deferred.await(retryCompleted)
      yield* Scope.close(scope, Exit.void)

      const batches = yield* Ref.get(attempts)
      expect(batches).toHaveLength(2)
      expect(batches[0]).toHaveLength(2)
      expect(batches[1]).toEqual([batches[0]?.[0]])
    })).pipe(
      // Test entry point owns the virtual clock Layer.
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(TestClock.layer()),
    )))
})
