import { Clock, DateTime, Effect, Fiber, Layer, Queue, Random, Ref, Scope, Semaphore } from "effect"
import type { ProductAnalyticsEvent } from "@proxus/shared/product-analytics"
import type { ProductAnalyticsEnvelope } from "./model.js"
import { ProductAnalyticsRepository, type ProductAnalyticsRepositoryError } from "./repository.js"
import { ProductAnalytics } from "./service.js"

export interface ProductAnalyticsOptions {
  readonly queueCapacity: number
  readonly batchSize: number
  readonly flushIntervalMs: number
  readonly shutdownTimeoutMs: number
  readonly maxRetries: number
  readonly retryBaseDelayMs: number
  readonly maximumPastSkewMs: number
  readonly maximumFutureSkewMs: number
}
export const defaultProductAnalyticsOptions: ProductAnalyticsOptions = {
  queueCapacity: 128, batchSize: 100, flushIntervalMs: 1_000,
  shutdownTimeoutMs: 5_000, maxRetries: 3, retryBaseDelayMs: 100,
  maximumPastSkewMs: 30 * 24 * 60 * 60 * 1_000, maximumFutureSkewMs: 5 * 60 * 1_000,
}
const valid = (o: ProductAnalyticsOptions) =>
  Object.values(o).every((n) => Number.isSafeInteger(n) && n >= 0) &&
  o.queueCapacity > 0 && o.batchSize > 0 && o.flushIntervalMs > 0 &&
  o.shutdownTimeoutMs > 0 && o.retryBaseDelayMs > 0 && o.maximumPastSkewMs > 0 &&
  o.maximumFutureSkewMs > 0 && o.maxRetries <= 10

const uuid = Effect.gen(function*() {
  // Effect's upper bound is inclusive; 256 would serialize to three hex digits.
  const bytes = yield* Effect.forEach(Array.from({ length: 16 }), () => Random.nextIntBetween(0, 255))
  bytes[6] = (bytes[6]! & 15) | 64; bytes[8] = (bytes[8]! & 63) | 128
  const h = bytes.map((b) => b.toString(16).padStart(2, "0"))
  return `${h.slice(0,4).join("")}-${h.slice(4,6).join("")}-${h.slice(6,8).join("")}-${h.slice(8,10).join("")}-${h.slice(10).join("")}`
})

export const makeProductAnalyticsLive = (options: ProductAnalyticsOptions = defaultProductAnalyticsOptions): Layer.Layer<ProductAnalytics, never, ProductAnalyticsRepository> =>
  Layer.effect(ProductAnalytics, Effect.gen(function*() {
    if (!valid(options)) return yield* Effect.die("Invalid ProductAnalytics configuration")
    const scope = yield* Scope.Scope
    const repository = yield* ProductAnalyticsRepository
    const queue = yield* Queue.dropping<ReadonlyArray<ProductAnalyticsEnvelope>>(options.queueCapacity)
    const accepting = yield* Ref.make(true)
    const lifecycle = yield* Semaphore.make(1)

    const persist = (batch: ReadonlyArray<ProductAnalyticsEnvelope>, attempt = 0): Effect.Effect<void> =>
      repository.writeBatch(batch).pipe(
        Effect.catch((error: ProductAnalyticsRepositoryError) => {
          const failed = error.failedIndexes === undefined
            ? batch
            : error.failedIndexes.flatMap((index) => batch[index] === undefined ? [] : [batch[index]!])
          const retryable = error.retryableIndexes === undefined
            ? (error.retryable ? failed : [])
            : error.retryableIndexes.flatMap((index) => batch[index] === undefined ? [] : [batch[index]!])
          const permanentCount = failed.length - retryable.length
          const reportPermanent = permanentCount > 0
            ? Effect.logWarning("Product analytics rows rejected permanently", { rows: permanentCount })
            : Effect.void
          if (retryable.length === 0 || attempt >= options.maxRetries) {
            return reportPermanent.pipe(Effect.andThen(retryable.length > 0
              ? Effect.logWarning("Product analytics retry budget exhausted", { rows: retryable.length })
              : Effect.void))
          }
          return reportPermanent.pipe(Effect.andThen(Random.next.pipe(Effect.flatMap((jitter) =>
            Effect.sleep(options.retryBaseDelayMs * 2 ** attempt * (0.5 + jitter)).pipe(
              Effect.andThen(persist(retryable, attempt + 1)),
            )))))
        }),
        // An interrupt requested during shutdown is observed only after the repository call.
        // Therefore a batch already removed from the queue cannot disappear in-flight.
        Effect.uninterruptible,
      )

    const persistAll = (envelopes: ReadonlyArray<ProductAnalyticsEnvelope>) => Effect.gen(function*() {
      for (let index = 0; index < envelopes.length; index += options.batchSize) {
        yield* persist(envelopes.slice(index, index + options.batchSize))
      }
    })
    const flush = Queue.clear(queue).pipe(Effect.flatMap((queued) => persistAll(queued.flat())))
    const worker = Effect.forever(Effect.gen(function*() {
      const first = yield* Queue.take(queue)
      yield* Effect.sleep(options.flushIntervalMs)
      const rest = yield* Queue.clear(queue)
      yield* persistAll([first, ...rest].flat())
    }))
    const workerFiber = yield* Effect.forkScoped(worker)
    yield* Scope.addFinalizer(scope, Semaphore.withPermit(lifecycle, Ref.set(accepting, false)).pipe(
      // interrupt waits for uninterruptible in-flight persistence before returning
      Effect.andThen(Fiber.interrupt(workerFiber)),
      Effect.andThen(flush.pipe(Effect.timeoutOrElse({
        duration: options.shutdownTimeoutMs,
        orElse: () => Effect.logWarning("Product analytics shutdown queued drain timed out"),
      }))),
      Effect.andThen(Queue.shutdown(queue)),
      Effect.asVoid,
    ))

    return ProductAnalytics.of({
      recordBatch: Effect.fn("ProductAnalytics.recordBatch")(function* (events: ReadonlyArray<ProductAnalyticsEvent>, context) {
        if (context.consent !== "granted") return { accepted: 0, rejected: events.length, reason: "no-consent" as const }
        const nowMs = yield* Clock.currentTimeMillis
        const validEvents = events.filter((event) => {
          if (event.occurredAt === undefined) return true
          const occurredAt = DateTime.toEpochMillis(event.occurredAt)
          return occurredAt >= nowMs - options.maximumPastSkewMs && occurredAt <= nowMs + options.maximumFutureSkewMs
        })
        // Admission is all-or-nothing: one invalid event rejects the complete browser batch.
        if (validEvents.length !== events.length) return { accepted: 0, rejected: events.length, reason: "invalid" as const }
        const now = DateTime.formatIso(DateTime.makeUnsafe(nowMs))
        const envelopes = yield* Effect.forEach(validEvents, (event) => uuid.pipe(Effect.map((eventId): ProductAnalyticsEnvelope => ({
          eventId, receivedAt: now,
          ...(event.occurredAt === undefined ? {} : { occurredAt: DateTime.formatIso(event.occurredAt) }),
          ...(context.analyticsSubjectId === undefined ? {} : { subjectId: context.analyticsSubjectId }),
          ...(context.sessionId === undefined ? {} : { sessionId: context.sessionId }), event,
        }))))
        const offered = yield* Semaphore.withPermit(lifecycle, Effect.gen(function*() {
          if (!(yield* Ref.get(accepting))) return false
          return yield* Queue.offer(queue, envelopes)
        }))
        return offered
          ? { accepted: events.length, rejected: 0 }
          : { accepted: 0, rejected: events.length, reason: (yield* Ref.get(accepting)) ? "full" as const : "closed" as const }
      }),
    })
  }))
export const ProductAnalyticsLive = makeProductAnalyticsLive()
