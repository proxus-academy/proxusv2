// @effect-diagnostics newPromise:off
import { Effect } from "effect"

export interface MutationRateLimiter {
  readonly run: <A, E>(document: string, mutation: Effect.Effect<A, E>) => Effect.Effect<A, E>
}
export interface MutationRateLimiterOptions {
  readonly minimumIntervalMs?: number
  readonly now?: () => number
  readonly sleep?: (milliseconds: number) => Effect.Effect<void>
}

interface DocumentSchedule { tail: Promise<void>; lastStartedAt?: number }

/**
 * Serializes mutation starts per document and per limiter instance. Waiting is
 * deliberately outside the document CAS mutex, so a queued child write cannot
 * prevent the parent from reaching lease renewal.
 */
export const makeMutationRateLimiter = ({
  minimumIntervalMs = 1_100,
  now = Date.now,
  sleep = (milliseconds) => Effect.sleep(`${milliseconds} millis`),
}: MutationRateLimiterOptions = {}): MutationRateLimiter => {
  if (!Number.isFinite(minimumIntervalMs) || minimumIntervalMs < 0) throw new RangeError("minimumIntervalMs must be non-negative")
  const schedules = new Map<string, DocumentSchedule>()
  return {
    run: (document, mutation) => Effect.acquireUseRelease(
      Effect.promise(() => {
        let schedule = schedules.get(document)
        if (schedule === undefined) {
          schedule = { tail: Promise.resolve() }
          schedules.set(document, schedule)
        }
        const previous = schedule.tail
        let release!: () => void
        schedule.tail = new Promise<void>((resolve) => { release = resolve })
        return previous.then(() => ({ release, schedule }))
      }),
      ({ schedule }) => Effect.gen(function* () {
        const wait = schedule.lastStartedAt === undefined ? 0 : Math.max(0, schedule.lastStartedAt + minimumIntervalMs - now())
        if (wait > 0) yield* sleep(wait)
        schedule.lastStartedAt = now()
        return yield* mutation
      }),
      ({ release }) => Effect.sync(release),
    ),
  }
}

/** One coordinator is shared by every live state/lease adapter in this process. */
export const processMutationRateLimiter = makeMutationRateLimiter()
