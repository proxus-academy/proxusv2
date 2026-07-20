import { Array, Clock, DateTime, Effect, Fiber, Layer, Option, Queue, Random, Ref, Scope, Semaphore } from "effect"
import {
  parseFeatureFlagSubjectId,
  RegistrationLanding,
} from "@proxus/shared/feature-flags"
import type { PublicProductAnalyticsEvent } from "@proxus/shared/product-analytics"
import type { ProductAnalyticsEnvelope } from "./model.js"
import {
  ProductAnalyticsRepository,
  type ProductAnalyticsRepositoryError,
} from "./repository.js"
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

const normalizeIndexes = (
  indexes: ReadonlyArray<number>,
  batchLength: number,
): ReadonlyArray<number> => {
  const seen = new Set<number>()
  const normalized: Array<number> = []
  for (const index of indexes) {
    if (
      Number.isSafeInteger(index) &&
      index >= 0 &&
      index < batchLength &&
      !seen.has(index)
    ) {
      seen.add(index)
      normalized.push(index)
    }
  }
  return normalized
}

const normalizeRepositoryFailure = (
  error: ProductAnalyticsRepositoryError,
  batchLength: number,
) => {
  const failedIndexes = error.failedIndexes === undefined
    ? Array.makeBy(batchLength, (index) => index)
    : normalizeIndexes(error.failedIndexes, batchLength)
  const failed = new Set(failedIndexes)
  const retryableIndexes = (error.retryableIndexes === undefined
    ? error.retryable
      ? failedIndexes
      : []
    : normalizeIndexes(error.retryableIndexes, batchLength)
  ).filter((index) => failed.has(index))
  return { failedIndexes, retryableIndexes }
}

const uuid = Effect.gen(function*() {
  const bytes = yield* Effect.forEach(
    Array.makeBy(16, (index) => index),
    (index) => Random.nextIntBetween(0, 255).pipe(
      Effect.map((byte) =>
        index === 6
          ? (byte & 15) | 64
          : index === 8
            ? (byte & 63) | 128
            : byte),
    ),
  )
  const h = bytes.map((byte) => byte.toString(16).padStart(2, "0"))
  return `${h.slice(0,4).join("")}-${h.slice(4,6).join("")}-${h.slice(6,8).join("")}-${h.slice(8,10).join("")}-${h.slice(10).join("")}`
})

export const makeProductAnalyticsLive = (options: ProductAnalyticsOptions = defaultProductAnalyticsOptions): Layer.Layer<ProductAnalytics, never, ProductAnalyticsRepository> =>
  Layer.effect(ProductAnalytics, Effect.gen(function*() {
    if (!valid(options)) return yield* Effect.die("Invalid ProductAnalytics configuration")
    const scope = yield* Scope.Scope
    const repository = yield* ProductAnalyticsRepository
    const queue = yield* Queue.dropping<Array.NonEmptyReadonlyArray<ProductAnalyticsEnvelope>>(options.queueCapacity)
    const accepting = yield* Ref.make(true)
    const lifecycle = yield* Semaphore.make(1)

    const persist = (
      batch: Array.NonEmptyReadonlyArray<ProductAnalyticsEnvelope>,
      attempt = 0,
    ): Effect.Effect<void> =>
      repository.writeBatch(batch).pipe(
        Effect.catchTag("ProductAnalyticsRepositoryError", (repositoryError) => {
          const indexes = normalizeRepositoryFailure(
            repositoryError,
            batch.length,
          )
          const failed = Array.getSomes(
            indexes.failedIndexes.map((index) => Array.get(batch, index)),
          )
          const retryable = Array.getSomes(
            indexes.retryableIndexes.map((index) => Array.get(batch, index)),
          )
          const permanentCount = failed.length - retryable.length
          const reportPermanent = permanentCount > 0
            ? Effect.logWarning(
                "Product analytics rows rejected permanently",
                { rows: permanentCount },
              )
            : Effect.void
          if (!Array.isReadonlyArrayNonEmpty(retryable)) return reportPermanent
          if (attempt >= options.maxRetries) {
            return reportPermanent.pipe(Effect.andThen(
              Effect.logWarning(
                "Product analytics retry budget exhausted",
                { rows: retryable.length },
              ),
            ))
          }
          return reportPermanent.pipe(Effect.andThen(
            Random.next.pipe(Effect.flatMap((jitter) =>
              Effect.sleep(
                options.retryBaseDelayMs * 2 ** attempt * (0.5 + jitter),
              ).pipe(Effect.andThen(persist(retryable, attempt + 1))),
            )),
          ))
        }),
      )

    const persistAll = (envelopes: ReadonlyArray<ProductAnalyticsEnvelope>) =>
      Effect.forEach(
        Array.chunksOf(envelopes, options.batchSize),
        (batch) => persist(batch),
        { discard: true },
      )
    const inFlight = yield* Ref.make<ReadonlyArray<ProductAnalyticsEnvelope>>(
      [],
    )
    const flush = Effect.uninterruptible(
      Queue.clear(queue).pipe(
        Effect.flatMap((queued) =>
          Ref.updateAndGet(inFlight, (current) => [
            ...current,
            ...queued.flat(),
          ]),
        ),
      ),
    ).pipe(
      Effect.flatMap((envelopes) =>
        envelopes.length === 0
          ? Effect.void
          : persistAll(envelopes).pipe(
              Effect.andThen(Ref.set(inFlight, [])),
            ),
      ),
    )
    const worker = Effect.forever(
      Effect.sleep(options.flushIntervalMs).pipe(Effect.andThen(flush)),
    )
    const workerFiber = yield* Effect.forkScoped(worker)
    const boundedShutdown = Semaphore.withPermit(
      lifecycle,
      Ref.set(accepting, false),
    ).pipe(
      Effect.andThen(Fiber.interrupt(workerFiber)),
      Effect.andThen(flush),
      Effect.timeoutOrElse({
        duration: options.shutdownTimeoutMs,
        orElse: () => Effect.logWarning(
          "Product analytics shutdown timed out",
        ),
      }),
      // Scope finalizers are uninterruptible by default. The bounded drain must
      // remain interruptible so its timeout also covers blocked repositories and retries.
      Effect.interruptible,
      Effect.ensuring(Queue.shutdown(queue)),
      Effect.asVoid,
    )
    yield* Scope.addFinalizer(scope, boundedShutdown)

    return ProductAnalytics.of({
      recordBatch: Effect.fn("ProductAnalytics.recordBatch")(function* (
        events: Array.NonEmptyReadonlyArray<PublicProductAnalyticsEvent>,
        context,
      ) {
        if (context.consent !== "granted") return { accepted: 0, rejected: events.length, reason: "no-consent" as const }
        const nowMs = yield* Clock.currentTimeMillis
        const subject = Option.fromNullishOr(parseFeatureFlagSubjectId(context.flagSubjectId ?? null))
        if (Option.isNone(subject)) return { accepted: 0, rejected: events.length, reason: "invalid" as const }
        const subjectId = subject.value
        const allEventsValid = events.every((event) => {
          if (event.flagKey !== RegistrationLanding.key) return false
          // Revision zero is the synthetic empty snapshot, so every installation
          // receives the local safe default. It must never be rehashed as an allocation.
          if (
            event.revision === 0 &&
            event.variant !== RegistrationLanding.default
          ) return false
          if (event.occurredAt === undefined) return true
          const occurredAt = DateTime.toEpochMillis(event.occurredAt)
          return occurredAt >= nowMs - options.maximumPastSkewMs && occurredAt <= nowMs + options.maximumFutureSkewMs
        })
        // Admission is all-or-nothing: one invalid event rejects the complete browser batch.
        if (!allEventsValid) return { accepted: 0, rejected: events.length, reason: "invalid" as const }
        const now = DateTime.formatIso(DateTime.makeUnsafe(nowMs))
        const envelopes = yield* Effect.forEach(events, (event) => uuid.pipe(Effect.map((eventId): ProductAnalyticsEnvelope => ({
          eventId, receivedAt: now,
          ...(event.occurredAt === undefined ? {} : { occurredAt: DateTime.formatIso(event.occurredAt) }),
          subjectId, flagKey: event.flagKey, variant: event.variant, revision: event.revision,
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
