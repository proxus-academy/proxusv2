# Effect Concurrency, Scheduling, and Batching

This document defines practical rules for concurrent Effects, fiber ownership, timeouts, retry/repeat schedules, semaphores, and `RequestResolver` batching in Effect v4.

Normative terms such as **MUST**, **SHOULD**, and **MAY** describe required, recommended, and optional practice.

## Mental model

An Effect describes work. A fiber is a running instance of that work. Concurrency changes execution order, resource pressure, interruption behavior, and observability; it is not a free performance flag.

A supervised fiber moves through these states:

```text
Created
  -> Scheduled/running
  -> Suspended or running
  -> Success | Failure | Interrupted
  -> Joined/observed and released
```

A retrying operation moves through:

```text
Attempt
  -> Success: done
  -> Non-retryable failure: fail now
  -> Retryable failure + schedule continues: delay, then Attempt
  -> Retryable failure + schedule stops: fail with the last failure
  -> Interruption: stop waiting/working and unwind
```

A batch resolver moves through:

```text
Request registered
  -> optional cache/pre-check
  -> collection window
  -> grouped batch
  -> resolver execution
  -> every entry completed with Exit
  -> caller resumes
```

## Core rules

1. Concurrency MUST be bounded by default when work consumes sockets, database connections, file descriptors, memory, or third-party quotas.
2. A caller MUST choose concurrency from the capacity of the constrained downstream resource, not from input size.
3. Child fibers MUST remain supervised unless a documented owner exists outside the parent.
4. Concurrent code MUST define its failure policy: fail-fast, collect all results, race for first success, or race for first completion.
5. Timeouts MUST map to an intentional typed outcome at product seams; they must not silently convert unknown work into success.
6. Retries MUST be limited, filtered to retryable failures, and delayed. Production retries SHOULD use exponential backoff and jitter.
7. Mutations MUST NOT be retried unless they are idempotent or protected by an idempotency mechanism.
8. A batch resolver MUST complete every request entry it receives.
9. Batching delay, batch size, cache policy, and downstream concurrency MUST be measured and tuned together.
10. Tracing MUST use stable operation names and safe aggregate attributes such as attempt number, batch size, delay, and status category.

**Project rule:** Domain modules own retry/idempotency decisions because those are product behavior. HTTP handlers remain transport adapters and repositories remain flat query adapters.

**Project rule:** Persistence concurrency must respect the selected adapter and transaction semantics. Do not add parallel repository calls merely because they are syntactically independent when a domain invariant requires one transaction.

## Choosing a concurrency primitive

| Need | Preferred primitive | Key semantics |
|---|---|---|
| Transform an iterable sequentially | `Effect.forEach` | Sequential by default; short-circuits on failure |
| Run a fixed set of Effects | `Effect.all` | Collects shape; configure concurrency explicitly |
| Limit parallel element work | `Effect.forEach(..., { concurrency: n })` | At most `n` operations in flight |
| Limit a shared scarce resource across callers | `Semaphore.make` + `withPermit(s)` | Permit released when wrapped Effect exits |
| Start owned background work | `Effect.forkChild` / `forkScoped` | Parent- or scope-supervised |
| First successful result | `Effect.race` / `raceAll` | Losers interrupted after success |
| First completion, including failure | `Effect.raceFirst` | Loser interrupted after first exit |
| Bound elapsed time | `Effect.timeout` / `timeoutOption` / `timeoutOrElse` | Timed work is interrupted on timeout |
| Coalesce independent lookups | `Request` + `RequestResolver` | Concurrent requests share resolver execution |
| Retry/repeat over time | `Schedule` + `Effect.retry` / `Effect.repeat` | Schedule controls continuation and delay |

## Structured concurrency and fibers

### Prefer high-level combinators

Use `Effect.all`, `Effect.forEach`, races, streams, or resolver batching before manually handling fibers. These combinators expose less lifecycle surface and preserve structured ownership.

```ts
const rows = yield* Effect.forEach(ids, loadById, {
  concurrency: 8
})
```

`Effect.forEach` is sequential by default and short-circuits on failure. `Effect.all` accepts arrays, iterables, records, and structs and also supports a `concurrency` option. Use `{ discard: true }` when results are intentionally irrelevant.

Do not use `"unbounded"` for external I/O without a proved bound elsewhere.

### Failure policy

Choose explicitly:

- **Fail-fast:** `Effect.all` or `Effect.forEach` in default mode. Use when one failure invalidates the aggregate result.
- **Capture every exit:** `Effect.all(..., { mode: "result" })`. Use when callers need per-item outcomes.
- **Partition failures and successes:** `Effect.partition`. It runs all work and returns `[failures, successes]`.
- **Accumulate all typed failures:** `Effect.validate`. It evaluates all elements and fails with a non-empty collection if any fail.

Do not catch failures inside each task merely to keep concurrency running unless the resulting aggregate semantics are documented.

### Fiber ownership

- `Effect.forkChild` attaches the fiber to the parent's scope. Parent termination interrupts the child.
- `Effect.forkScoped` attaches the fiber to the current explicit `Scope`.
- `Effect.forkIn` attaches it to a supplied scope.
- `Effect.forkDetach` attaches it to the global scope and outlives its caller.
- `Fiber.join` waits and propagates the fiber's success or typed failure.
- `Fiber.await` observes its `Exit` without rethrowing the typed failure.
- `Fiber.interrupt` requests interruption and waits for termination.

Detached fibers SHOULD NOT be used for requests, jobs, or application workers. They obscure ownership and graceful shutdown.

### Cooperative scheduling

`Effect.sleep` suspends the fiber without blocking the runtime thread. Long CPU-bound loops SHOULD periodically cross an Effect boundary or use `Effect.yieldNow`/`yieldNowWith` so other fibers can run. CPU-heavy work that blocks JavaScript still blocks the process; fibers do not create OS-level parallelism.

`Effect.withConcurrency` sets the inherited concurrency level for nested parallel operations. Prefer a local `concurrency` option when one operation has an obvious capacity; use inherited concurrency when a whole workflow must share one policy.

## Semaphores for shared capacity

Use a semaphore when many call sites compete for the same scarce capacity.

```ts
const semaphore = yield* Semaphore.make(10)

const guarded = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Semaphore.withPermit(semaphore, effect)
```

- `withPermit` acquires one permit and releases it when the wrapped Effect exits.
- `withPermits` can model weighted work.
- `withPermitsIfAvailable` returns an `Option` instead of waiting when capacity is unavailable.
- `take` and `release` are lower-level and SHOULD be avoided when `withPermit(s)` can guarantee release.
- `resize` MAY be used for deliberate runtime capacity changes, but resizing must be observable and configuration-driven.

Do not hold a permit across unrelated sleeps, retries, user think-time, or downstream work that does not consume the protected resource.

## Races and timeouts

### Race semantics

- `Effect.race` and `raceAll` return the first **successful** result; failures do not win while another candidate may succeed. Losers are interrupted after a winner succeeds.
- `Effect.raceFirst` returns the first completion, whether success or failure, and interrupts the loser.

Raced operations MUST be safe to interrupt. If a candidate performs an irreversible side effect, racing can duplicate work or leave ambiguity about completion.

### Timeout semantics

- `Effect.timeout(duration)` adds `Cause.TimeoutError` to the typed failure channel.
- `Effect.timeoutOption(duration)` returns `None` on timeout while preserving original typed failures.
- `Effect.timeoutOrElse` runs a fallback on timeout.

A timeout is an upper bound for waiting, not proof that an external system canceled the operation. Promise/driver adapters SHOULD propagate cancellation, for example through an Effect-managed `AbortSignal`, when supported.

At a public seam, map timeout to a shared expected error only when clients can act on it. Otherwise map it to the repository/internal error policy without exposing implementation details.

## Schedules

A `Schedule<Output, Input, Error, Env>` receives inputs from retry/repeat machinery, decides whether to continue, computes delay, and emits schedule output.

Common constructors:

- `Schedule.recurs(n)`: continue a finite number of recurrences.
- `Schedule.spaced(duration)`: fixed spacing.
- `Schedule.exponential(base)`: exponentially increasing delay.
- `Schedule.forever`: continue indefinitely with zero spacing; unsafe for retries unless combined with delay and a stop rule.

Composition:

- `Schedule.both(a, b)` continues only while both schedules continue. Use it to combine a delay policy with a hard recurrence cap.
- `Schedule.either(a, b)` continues while either continues. It is not a substitute for a hard cap.
- `Schedule.while` continues only while its predicate accepts the current input.
- `Schedule.jittered` randomizes delays to reduce synchronized retry storms.
- `Schedule.tapInput` and `tapOutput` add effects such as logging or metrics without changing schedule decisions.

### Retry recipe

```ts
const retryPolicy = Schedule.both(
  Schedule.exponential("250 millis"),
  Schedule.recurs(6)
).pipe(
  Schedule.jittered,
  Schedule.setInputType<RemoteError>(),
  Schedule.while(({ input }) => input.retryable),
  Schedule.tapInput((error) =>
    Effect.logDebug("remote retry", {
      status: error.status,
      retryable: error.retryable
    })
  )
)

const result = operation.pipe(Effect.retry(retryPolicy))
```

Rules:

1. Classify retryability in the typed error model.
2. Fail fast for authentication, authorization, validation, and other permanent failures.
3. Include a finite recurrence cap.
4. Add backoff and jitter for distributed systems.
5. Bound each attempt with an operation-specific timeout when the adapter can cancel safely.
6. Preserve the final typed failure after schedule exhaustion; do not call `orDie` for user-manageable failures.
7. Record attempt count, status category, and delay, never raw request bodies or secrets.

### Retry versus repeat

- `Effect.retry(schedule)` feeds failures to the schedule and reruns after retryable failure.
- `Effect.repeat(schedule)` feeds successful outputs to the schedule and reruns after success.
- Polling may use `Effect.repeat`, `Stream.fromEffectSchedule`, or a worker loop. Choose Streams when consumers need a sequence of outputs and cancellation through stream scope.

Do not use retry to implement polling, and do not use repeat to hide failures.

## Request batching

### When batching is appropriate

Use `Request.Class`, `Effect.request`, and `RequestResolver` when many independent logical lookups can be fulfilled more efficiently by one external operation, such as `WHERE id IN (...)` or a bulk HTTP endpoint.

Do not batch merely to hide an N+1 domain design problem. A repository method that naturally owns a set query is often deeper and simpler than exposing per-row requests.

### Resolver contract

A resolver receives a non-empty collection of request entries. It MUST complete every entry exactly once with an `Exit`:

```ts
entry.completeUnsafe(Exit.succeed(value))
entry.completeUnsafe(Exit.fail(error))
```

If any entry remains unresolved, query execution fails. The resolver should:

1. Extract and deduplicate lookup keys for the external call.
2. Execute the minimum number of bulk operations.
3. Map returned values by key.
4. Complete every original entry, including missing values and duplicates.
5. Keep request-level typed errors distinct from resolver defects.

Request entries carry captured context. A resolver MAY inspect it for requirements or the parent tracing span.

### Creating and shaping batches

- `RequestResolver.make` uses one default batch key, yields once by default, and collects while possible.
- `setDelay(duration)` widens the collection window but adds latency to the first request.
- `batchN(n)` stops collecting when the batch reaches `n`; align this with driver/endpoint limits.
- `grouped(key)` or `makeGrouped` separates requests that cannot share one external operation, such as region or scope.
- `around` brackets resolver execution with setup and cleanup.
- Concurrent callers are required for coalescing. Sequentially awaiting each lookup prevents useful batching.

```ts
const values = yield* Effect.forEach(ids, getById, {
  concurrency: "unbounded"
})
```

Using unbounded concurrency here is acceptable only when `Effect.request` is the immediate operation and the resolver itself imposes batch/downstream limits. If additional I/O occurs before registration, use a finite bound.

### Resolver caching

`RequestResolver.withCache({ capacity, strategy })` returns an Effect that builds a cached resolver; it must be yielded during Layer construction. It deduplicates in-flight equivalent requests and stores completed exits with LRU or FIFO eviction.

Rules:

- Cache only request values with stable equality semantics.
- Decide whether failures may be cached; `withCache` stores completed exits, not only successes.
- Capacity is mandatory; do not create an unbounded resolver cache.
- Resolver caching has no TTL option. Use `RequestResolver.asCache` when TTL semantics are required, or avoid caching.
- Invalidate or bypass cache when writes make cached reads stale; if that cannot be stated clearly, do not add the cache.

### Batching observability

Use `RequestResolver.withSpan("<Module>.<operation>.resolver")`. Effect v4 adds `batchSize` and links the resolver span to distinct parent request spans.

Safe attributes:

- batch size
- unique key count
- cache hit/miss count
- group category when non-sensitive
- attempt count
- elapsed time
- status category

Unsafe attributes:

- raw request payloads
- emails, names, titles, or descriptions
- tokens and credentials
- full SQL text
- sensitive tenant/customer identifiers without approval

Expected trace shape:

```text
<Module>.getById [request span] --link--+
<Module>.getById [request span] --link--+--> <Module>.getById.resolver
<Module>.getById [request span] --link--+
```

## Recipes

### Parallel independent reads

1. Confirm no transaction or ordering invariant couples the reads.
2. Identify the narrowest downstream capacity.
3. Use `Effect.all` or `Effect.forEach` with a finite concurrency value.
4. Choose fail-fast versus collected outcomes.
5. Add a workflow span and operation spans at meaningful seams.
6. Test failure and interruption while other tasks are in flight.

### Idempotent remote call with retry

1. Give the operation an idempotency key or prove it is read-only/idempotent.
2. Model retryability in a typed error.
3. Apply a cancelable per-attempt timeout.
4. Apply finite exponential backoff with jitter and a retryability predicate.
5. Preserve the final typed error.
6. Emit safe attempt/delay metrics.

### Bulk lookup resolver

1. Define one `Request.Class` for one logical lookup.
2. Build a resolver in the owning Layer.
3. Group by scope if cross-scope batching would be invalid.
4. Set a small measured delay and maximum batch size.
5. Perform one bulk adapter call per group.
6. Complete every entry.
7. Add resolver span links and aggregate attributes.
8. Add cache only with a staleness policy.
9. Test duplicates, misses, partial backend results, full failure, interruption, and cache behavior.

## Anti-patterns

- Setting `concurrency: "unbounded"` on database or HTTP work because fibers are lightweight.
- Forking and discarding the `Fiber` without assigning lifecycle ownership.
- Using `forkDetach` for request work or application workers.
- Racing non-idempotent writes.
- Treating timeout as proof that the external operation did not commit.
- Retrying every error, including 4xx validation/auth failures.
- Infinite retry schedules with no delay or shutdown path.
- Retrying a mutation without idempotency.
- Holding a semaphore permit during retry backoff.
- Adding batching around a repository interface that should accept a set directly.
- Adding delay to improve batch size without measuring added tail latency.
- Failing to complete missing request entries.
- Caching resolver failures or stale values without an explicit policy.
- Logging raw failures when they include payloads, credentials, or PII.

## Review checklist

- [ ] Concurrency is finite or bounded at a clearly documented lower seam.
- [ ] The constrained downstream capacity determines the limit.
- [ ] Failure aggregation semantics are explicit.
- [ ] Every forked fiber has an owner, join/observation policy, and interruption path.
- [ ] Raced operations are interruptible and safe to duplicate/start concurrently.
- [ ] Timeouts map to intentional typed outcomes.
- [ ] Retryable failures are classified; permanent failures fail fast.
- [ ] Retry has backoff, jitter, and a finite cap.
- [ ] Retried writes are idempotent.
- [ ] Semaphore permits cover only the protected work.
- [ ] Every resolver entry is completed exactly once.
- [ ] Batch delay and size respect external limits and measured latency.
- [ ] Resolver cache capacity and staleness behavior are documented.
- [ ] Batch and retry telemetry uses safe aggregate fields.
- [ ] Tests cover failure, interruption, duplicates, and limits.

## Source map

Primary examples and explanations:

- `.repos/effect-smol/ai-docs/src/05_batching/index.md` — batching topic.
- `.repos/effect-smol/ai-docs/src/05_batching/10_request-resolver.ts` — request types, resolver completion, delay, span links, cache, and concurrent registration.
- `.repos/effect-smol/ai-docs/src/06_schedule/index.md` — schedule purpose.
- `.repos/effect-smol/ai-docs/src/06_schedule/10_schedules.ts` — constructors, composition, retryability predicates, jitter, and schedule instrumentation.
- `.repos/effect-smol/ai-docs/src/02_stream/10_creating-streams.ts` — scheduled polling with `Stream.fromEffectSchedule`.
- `.repos/effect-smol/ai-docs/src/02_stream/20_consuming-streams.ts` — controlled stream concurrency.

Effect v4 source confirmations:

- `.repos/effect-smol/packages/effect/src/Effect.ts` — `all`, `forEach`, validation modes, concurrency inheritance, sleep/yield, races, timeouts, retry/repeat, interruption, requests, and fiber forks.
- `.repos/effect-smol/packages/effect/src/Fiber.ts` — await, join, and interruption operations.
- `.repos/effect-smol/packages/effect/src/Semaphore.ts` — permit lifecycle, conditional acquisition, and resizing.
- `.repos/effect-smol/packages/effect/src/RequestResolver.ts` — resolver contract, grouping, collection delay, maximum batches, tracing links, and cache semantics.
- `.repos/effect-smol/packages/effect/src/Schedule.ts` — schedule constructors, combinators, jitter, predicates, and taps.
- `.repos/effect-smol/packages/effect/src/Stream.ts` — concurrent mapping and scheduled stream construction.

Project rules:

- `AGENTS.md` — domain/repository responsibilities, errors, observability, and testing requirements.
- `docs/architecture.md` — canonical backend flow, transaction ownership, adapter policy, and safe error mapping.
- `docs/observability.md` — stable operation names and safe annotations.
