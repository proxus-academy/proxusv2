# Effect Streams, PubSub, and Dataflow

This document defines how to model finite and infinite dataflows with Effect v4 Streams and in-process fan-out with `PubSub`.

Normative terms such as **MUST**, **SHOULD**, and **MAY** describe required, recommended, and optional practice.

## Mental model

A `Stream<A, E, R>` is an effectful, pull-based sequence. It may be finite or infinite, may fail with `E`, and requires `R`. A stream description is lazy: acquisition and element production occur when a `run*` consumer executes it.

A stream run has these states:

```text
Idle description
  -> Materializing/acquiring
  -> Pulling chunks
  -> Emitting and transforming
  -> Completed | Failed | Interrupted
  -> Finalizing resources
```

A `PubSub<A>` is an in-process fan-out mechanism. Each active subscriber receives messages published after subscription, plus configured replay. It is not durable storage.

```text
PubSub active
  -> subscribers enter scoped subscriptions
  -> publishers publish
  -> strategy handles capacity pressure
  -> subscriptions close independently
  -> PubSub shutdown interrupts suspended publishers/subscribers
  -> shutdown
```

## Core rules

1. Use a Stream when values arrive over time, the source may be large or infinite, or acquisition/cancellation must be tied to consumption.
2. Keep stream construction lazy. Do not open resources merely by defining a stream.
3. Every callback, event listener, readable, subscription, and background producer MUST have a finalizer.
4. Every infinite stream MUST have an ownership scope and an interruption path.
5. Backpressure strategy MUST be explicit wherever producer and consumer rates can diverge.
6. Lossless flows MUST use suspending/backpressured bounded queues or durable external infrastructure; dropping/sliding strategies are lossy by design.
7. `PubSub` MUST NOT be used for durable events, cross-process delivery, transactional publication, or guaranteed replay after process restart.
8. Concurrent stream operators MUST have finite concurrency unless a lower seam provides a proven bound.
9. Schema validation MUST occur when untrusted bytes or unknown values enter the typed dataflow.
10. Observability MUST use aggregate, non-sensitive metadata; never record raw stream elements by default.

**Project rule:** HTTP handlers remain transport adapters. Stream parsing/encoding belongs at transport or integration seams; product behavior remains in domain modules and persistence remains behind repository interfaces.

**Project rule:** In-process events do not replace repository transactions or durable integration/outbox designs when delivery affects product correctness.

## Choosing the right abstraction

| Need | Use | Do not use |
|---|---|---|
| One asynchronous result | `Effect` | One-element Stream without compositional need |
| Many values pulled over time | `Stream` | Materializing everything in an array first |
| Work queue with one item taken by one consumer | `Queue` | `PubSub` fan-out |
| Same in-process message to many consumers | `PubSub` / `Stream.fromPubSub` | Repeated manual queues |
| Durable cross-process events | External broker/outbox adapter | In-memory `PubSub` |
| Share one stream execution | `Stream.broadcast` or `Stream.share` | Running the cold stream once per consumer accidentally |
| Batch by size/time | `Stream.groupedWithin` | Ad hoc timer and mutable array |

## Creating streams

### Finite in-memory sources

- `Stream.fromIterable` converts an iterable.
- `Stream.fromArray` and `Stream.make` create finite streams.
- `Stream.fromEffect` emits one successful Effect result.

Use a plain `Effect` or array when streaming adds no lifecycle, memory, or composition leverage.

### Repeated and polled effects

`Stream.fromEffectSchedule(effect, schedule)` evaluates an Effect according to a schedule and emits each result. Use it for metrics sampling, health checks, and cache refresh streams.

```ts
const samples = Stream.fromEffectSchedule(
  readGauge,
  Schedule.spaced("30 seconds")
)
```

A polling stream MUST be interrupted when its owning scope closes. Decide how failures behave: terminate, retry with a bounded policy, or become explicit data. Do not catch all failures and continue silently.

### Pagination

Use `Stream.paginate(initialState, step)` when an external interface exposes pages or cursors. The step returns the current values and `Option` of the next state.

Rules:

- Treat the cursor as opaque unless the external interface specifies otherwise.
- Stop with `Option.none()`.
- Detect accidental cursor cycles when the provider can return malformed pagination.
- Apply per-page retry/timeout policy deliberately.
- Do not `runCollect` unbounded result sets.

### Async iterables

Use `Stream.fromAsyncIterable(iterable, onError)` and map thrown/rejected causes to a typed integration error. If the async iterable owns resources, confirm that iterator cancellation closes them; otherwise wrap the source in an explicit scoped adapter.

### Browser events and callbacks

`Stream.fromEventListener` manages ordinary event listener consumption. Use `Stream.callback` for custom callback interfaces:

```ts
const events = Stream.callback<Event, EventError>(
  Effect.fn(function*(queue) {
    const onEvent = (event: Event) => {
      Queue.offerUnsafe(queue, event)
    }

    yield* Effect.acquireRelease(
      Effect.sync(() => source.addListener(onEvent)),
      () => Effect.sync(() => source.removeListener(onEvent))
    )
  })
)
```

The callback adapter MUST unregister listeners when consumption completes, fails, or is interrupted. The unsafe offer is appropriate only at a synchronous callback edge; overflow behavior remains the adapter's responsibility.

### Node readable streams

Use `NodeStream.fromReadable` with:

- a lazy `evaluate` function,
- an `onError` mapper to a typed integration error,
- `closeOnDone: true` unless ownership explicitly belongs elsewhere.

Do not instantiate a one-shot readable outside `evaluate` if the Effect Stream may be run more than once.

## Transforming and consuming streams

### Pure and effectful transforms

- `Stream.map`: pure per-element transform.
- `Stream.filter`: pure filtering.
- `Stream.flatMap`: map each element to a Stream and flatten.
- `Stream.mapEffect`: effectful per-element transform.
- `Stream.tap`: effectful observation while preserving elements.

`mapEffect` supports `concurrency` and `unordered`. By default, prefer ordered output. Set `unordered: true` only when order is not part of the interface and reduced coordination is valuable.

`flatMap` supports `concurrency` and `bufferSize`. Concurrent inner streams may interleave; document ordering semantics.

`switchMap` interrupts the previous inner stream when a newer input arrives. Use it for latest-only work such as search suggestions, not for work that must complete.

### Terminal consumers

A stream does nothing until consumed:

- `Stream.runCollect`: collect all elements into an array.
- `Stream.runDrain`: run effects and discard outputs.
- `Stream.runForEach`: effectfully consume each element.
- `Stream.runFold`: reduce to one value.
- `Stream.run(sink)`: consume through an arbitrary Sink.
- `runHead` / `runLast`: return `Option` of an edge element.

`runCollect` MUST be used only when the stream is known to be finite and bounded enough for memory. Infinite or user-sized flows should be folded, drained, written incrementally, or bounded with `take`.

### Windowing and aggregation

- `take`, `takeWhile`, and `takeUntil` bound consumption and naturally end upstream work.
- `drop` and related operators skip elements.
- `grouped(n)` emits fixed-size groups, with a possibly smaller final group.
- `groupedWithin(size, duration)` flushes by size or time.
- `aggregate` and `aggregateWithin` use Sinks for richer stateful aggregation.
- `groupBy`/`groupByKey` create per-key substreams and support `bufferSize` and `idleTimeToLive`.

Every key-grouped flow MUST address cardinality. Unbounded keys with infinite idle TTL can retain queues indefinitely. Configure a finite `idleTimeToLive` when groups may disappear.

## Backpressure and buffering

Pull-based streams naturally pace upstream work, but explicit concurrency, callbacks, multicast, and asynchronous adapters introduce queues.

### `Stream.buffer`

`Stream.buffer` decouples a faster producer from a slower consumer by buffering elements. It destroys original chunking.

Strategies:

- `"suspend"`: producer waits when full; lossless while the process remains alive.
- `"dropping"`: newest offered elements may be discarded when full.
- `"sliding"`: oldest buffered elements are discarded to admit newer ones.
- `"unbounded"`: no capacity limit; risks memory growth.

Use bounded `"suspend"` by default. Choose dropping or sliding only when loss is an accepted part of the interface, such as best-effort telemetry or latest-state updates.

### `Stream.bufferArray`

`Stream.bufferArray` buffers chunks and preserves chunking. Prefer it when chunk boundaries matter or downstream writes operate efficiently on batches. Power-of-two capacities are recommended by the source implementation for best performance.

Buffering does not increase a slow consumer's throughput. It only absorbs bursts and changes where waiting or loss occurs.

### Capacity selection

Capacity SHOULD be based on:

- maximum tolerated memory,
- expected element/chunk size,
- burst duration,
- downstream latency,
- acceptable producer suspension,
- acceptable loss.

Observe queue depth, dropped count, element latency, and consumer failures. Do not tune capacity from throughput alone.

## PubSub

### Delivery semantics

`PubSub` fans each published value to all active subscribers. A scoped subscription is automatically removed when its scope exits. With replay configured, new subscribers first receive recent buffered values and then live values.

Replay is an in-memory convenience, not restart recovery. A process restart loses the PubSub and replay buffer.

### Strategy selection

| Constructor | Full-capacity behavior | Appropriate for |
|---|---|---|
| `PubSub.bounded` | Publisher suspends until space is available | Lossless in-process fan-out with backpressure |
| `PubSub.dropping` | New message is dropped; `publish` returns `false` | Best-effort signals where old queued data matters more |
| `PubSub.sliding` | Oldest message is evicted for the new message | Latest-state or freshness-first signals |
| `PubSub.unbounded` | Grows without a configured capacity | Only when a strict external bound proves safe |

Bounded capacities SHOULD be powers of two for best performance.

`publish` and `publishAll` return whether publication succeeded. Callers using dropping semantics MUST inspect or intentionally count false results; discarding the boolean hides data loss.

### Lifecycle

A PubSub-owning Layer SHOULD register shutdown in the same scope:

```ts
const pubsub = yield* PubSub.bounded<DomainEvent>({
  capacity: 256,
  replay: 50
})

yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub))
```

`PubSub.shutdown` is uninterruptible, interrupts fibers suspended on publish/take, closes subscriptions, and causes future publish/take operations to stop according to shutdown semantics. `awaitShutdown` waits for that lifecycle transition.

Direct subscriptions require a `Scope`:

```ts
yield* Effect.scoped(
  Effect.gen(function*() {
    const subscription = yield* PubSub.subscribe(pubsub)
    const value = yield* PubSub.take(subscription)
    // subscription is removed when this scope exits
  })
)
```

Prefer exposing `Stream.fromPubSub(pubsub)` rather than exposing raw take operations when consumers benefit from Stream composition.

### Domain event module recipe

```ts
class DomainEvents extends Context.Service<DomainEvents, {
  readonly publish: (event: DomainEvent) => Effect.Effect<void>
  readonly publishAll: (events: ReadonlyArray<DomainEvent>) => Effect.Effect<void>
  readonly subscribe: Stream.Stream<DomainEvent>
}>()("app/DomainEvents") {
  static readonly layer = Layer.effect(
    DomainEvents,
    Effect.gen(function*() {
      const pubsub = yield* PubSub.bounded<DomainEvent>({ capacity: 256 })
      yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub))

      return DomainEvents.of({
        publish: Effect.fn("DomainEvents.publish")((event) =>
          PubSub.publish(pubsub, event).pipe(Effect.asVoid)
        ),
        publishAll: Effect.fn("DomainEvents.publishAll")((events) =>
          PubSub.publishAll(pubsub, events).pipe(Effect.asVoid)
        ),
        subscribe: Stream.fromPubSub(pubsub)
      })
    })
  )
}
```

This recipe is suitable only when message loss on process failure and non-transactional delivery are acceptable. If publication must be atomic with a database write or survive restart, use a durable outbox/broker design instead.

## Multicasting streams

Cold streams normally run their source once per consumer. Use multicast operators when consumers must share one execution.

### `Stream.broadcast`

`Stream.broadcast(source, options)` starts a PubSub-backed multicast source in the surrounding scope and returns a stream for subscribers. Capacity, strategy, and replay are explicit. The broadcast resource remains tied to the scope that created it.

Use it when the owner intentionally starts one source and controls its complete lifetime.

### `Stream.share`

`Stream.share(source, options)` subscribes upstream when the first consumer starts. Upstream continues while at least one consumer exists and is finalized after the last exits. `idleTimeToLive` can keep upstream alive briefly so a later subscriber continues rather than restarting.

Use it for demand-driven sharing. Configure replay when late or sequential consumers need recent elements.

Rules for both:

- Create the shared stream inside `Effect.scoped` or a resource Layer.
- Choose a loss/backpressure strategy explicitly.
- Do not assume every subscriber sees the same prefix unless replay and subscription timing guarantee it.
- A slow subscriber can affect backpressured publication; design capacity and consumer isolation deliberately.
- Test subscriber arrival, departure, interruption, source failure, and last-subscriber cleanup.

## Encoding and decoding dataflows

Use `Stream.pipeThroughChannel` with Effect's encoding channels for incremental structured data.

### NDJSON

- `Ndjson.decodeString()` parses newline-delimited JSON strings.
- `Ndjson.decode()` accepts `Uint8Array` chunks.
- `Ndjson.decodeSchemaString(Schema)()` parses and validates each line.
- `Ndjson.encodeString()` emits JSON lines as strings.
- `Ndjson.encode()` emits binary chunks.
- Schema variants apply schema transformations and validation during encoding/decoding.

At untrusted seams, prefer schema variants. Raw JSON parsing is not domain validation.

`ignoreEmptyLines: true` MAY be used only when blank lines are accepted by the protocol. Otherwise, malformed framing should fail.

`NdjsonError` distinguishes packing and unpacking through `kind`. Catch it only when a recovery protocol exists; do not replace malformed input with fabricated domain values.

### Msgpack

`Msgpack.decodeSchema` and corresponding encode/decode channels provide the same channel-oriented pattern for binary MessagePack. Protocol selection belongs to the transport/integration interface, not domain behavior.

### Pipeline recipe

```text
bytes/text source
  -> framing decoder
  -> schema validation
  -> pure/effectful domain mapping
  -> filtering/aggregation
  -> schema encoding
  -> incremental sink
```

Keep transport errors, schema errors, and domain errors distinct until the seam that intentionally maps them.

## Failure, completion, and interruption

- Normal completion closes upstream resources and downstream subscriptions.
- Typed source or transform failure terminates the stream unless handled with a targeted recovery operator.
- Interruption closes scopes and runs finalizers; it should not be converted to an ordinary domain value.
- `Stream.catchTag`/targeted catches may recover known typed errors.
- `Stream.catchCause` can observe all causes, including interruption in uninterruptible streams, and SHOULD be reserved for infrastructure-level handling.
- `Stream.ensuring`, `onExit`, `onError`, `onStart`, and `onEnd` support lifecycle actions; resource release should still use scoped acquisition where possible.
- `Stream.interruptWhen(effect)` and `haltWhen(effect)` provide external termination signals with distinct timing semantics; verify the chosen behavior against tests before using it for protocol shutdown.

A consumer that stops early with `take`, `runHead`, failure, or interruption MUST trigger source cleanup. Custom adapters need tests proving this.

## Observability

Instrument dataflows at meaningful stages, not per element by default.

Recommended spans:

```text
<Module>.consume
  <Integration>.read
  <Module>.decode
  <Module>.batch
  <Adapter>.write
```

Safe annotations and metrics:

- element/chunk count
- encoded byte count
- batch size
- queue capacity and depth
- dropped/slid message count
- subscriber count
- lag/duration buckets
- completion category
- stable non-sensitive event tag

Do not record raw messages, event bodies, emails, titles, descriptions, tokens, secrets, or full URLs with query strings. If a field comes from user input, prefer length, count, boolean, or approved category.

Per-element spans can produce excessive volume and sensitive attributes. Prefer one consumer/run span, batch spans, and counters. When resolver or multicast links exist, use span links rather than pretending concurrent consumers form one parent-child chain.

## Recipes

### Bounded processing pipeline

1. Create the source lazily.
2. Map source failures to typed integration errors.
3. Validate unknown input at entry.
4. Add a bounded suspending buffer only if producer/consumer decoupling is needed.
5. Use finite `mapEffect` concurrency based on downstream capacity.
6. Batch with `groupedWithin` when the adapter supports bulk writes.
7. Consume incrementally with `runForEach` or a Sink.
8. Scope the run and verify interruption cleanup.
9. Record counts, latency, queue depth, and errors safely.

### In-process fan-out

1. Confirm durability and cross-process delivery are not required.
2. Define a tagged event union.
3. Create a bounded PubSub in a Layer.
4. Choose suspend, drop, or slide from explicit loss semantics.
5. Register PubSub shutdown as a finalizer.
6. Expose publish methods and a subscription Stream.
7. Fork each long-lived consumer in an owning scope.
8. Test slow consumers, replay, shutdown, and publication results.

### Streaming NDJSON ingestion

1. Adapt the body/file/socket to `Stream<Uint8Array, IntegrationError>`.
2. Decode with `Ndjson.decodeSchemaString` or binary `decodeSchema` equivalent.
3. Reject malformed framing/schema values as typed input errors.
4. Transform and batch records without collecting the full input.
5. Apply finite write concurrency or bulk persistence.
6. Stop and finalize on client disconnect/interruption.
7. Report byte/record counts, not raw records.

## Anti-patterns

- Calling `runCollect` on an infinite or user-unbounded stream.
- Creating a socket, reader, or listener eagerly outside stream acquisition.
- Registering callbacks without unregistering them on interruption.
- Using an unbounded buffer or PubSub to "avoid backpressure."
- Selecting dropping/sliding without exposing and measuring data loss.
- Ignoring the boolean from a dropping `PubSub.publish`.
- Treating replay as durable recovery.
- Using in-memory PubSub for transactional domain events that must survive restart.
- Running one cold stream independently per subscriber when the source must be shared.
- Assuming broadcast subscribers have identical history without considering replay and subscription timing.
- Setting unbounded `mapEffect` concurrency for external I/O.
- Creating unbounded per-key groups with infinite idle lifetime.
- Catching all stream causes and continuing with fabricated values.
- Logging each raw element for debugging.
- Mixing transport decoding, product decisions, and persistence writes in one opaque stream stage.

## Review checklist

- [ ] Stream is justified over a single Effect or bounded collection.
- [ ] Source creation is lazy and repeatable when the stream may be rerun.
- [ ] Every external resource/listener/subscription has scoped cleanup.
- [ ] Infinite streams have explicit ownership and interruption.
- [ ] Buffer capacity and strategy are explicit.
- [ ] Lossy strategies expose and measure dropped data.
- [ ] `runCollect` input is finite and memory-bounded.
- [ ] Effectful mapping uses finite concurrency.
- [ ] Ordering requirements are documented.
- [ ] PubSub is used only for in-process, non-durable fan-out.
- [ ] PubSub shutdown and subscription scopes are wired.
- [ ] Replay semantics are sufficient but not mistaken for persistence.
- [ ] Multicast lifecycle matches `broadcast` or `share` semantics intentionally.
- [ ] Unknown input is schema-validated at entry.
- [ ] Transport, schema, domain, and persistence failures remain distinguishable.
- [ ] Metrics/spans are aggregate and free of sensitive payloads.
- [ ] Tests cover early stop, failure, interruption, and finalization.

## Source map

Primary examples and explanations:

- `.repos/effect-smol/ai-docs/src/01_effect/06_pubsub/index.md` — PubSub fan-out purpose.
- `.repos/effect-smol/ai-docs/src/01_effect/06_pubsub/10_pubsub.ts` — bounded PubSub, replay, scoped shutdown, event module, and Stream subscription.
- `.repos/effect-smol/ai-docs/src/02_stream/index.md` — pull-based finite/infinite Stream model.
- `.repos/effect-smol/ai-docs/src/02_stream/10_creating-streams.ts` — iterable, polling, pagination, async iterable, event listener, callback, and Node readable sources.
- `.repos/effect-smol/ai-docs/src/02_stream/20_consuming-streams.ts` — transforms, controlled concurrency, terminal consumers, and windowing.
- `.repos/effect-smol/ai-docs/src/02_stream/30_encoding.ts` — NDJSON/Msgpack channels, schema variants, binary variants, blank lines, and errors.
- `.repos/effect-smol/ai-docs/src/06_schedule/10_schedules.ts` — spacing and schedule composition used by polling/aggregation.

Effect v4 source confirmations:

- `.repos/effect-smol/packages/effect/src/Stream.ts` — source constructors, scoped streams, mapping/flattening, buffers, grouping, aggregation, multicast, encoding pipes, lifecycle hooks, consumers, and PubSub/Queue bridges.
- `.repos/effect-smol/packages/effect/src/PubSub.ts` — capacity strategies, replay, publication results, scoped subscriptions, shutdown, and suspended operation interruption.
- `.repos/effect-smol/packages/effect/src/Schedule.ts` — schedule semantics used by polling and timed aggregation.
- `.repos/effect-smol/packages/effect/src/Effect.ts` — scopes, interruption, finalizers, and concurrent execution supporting stream runs.

Project rules:

- `AGENTS.md` — layered backend flow, transport/domain/persistence responsibilities, observability, and safe annotations.
- `docs/architecture.md` — concrete module seams, repository policy, error mapping, and application composition.
- `docs/observability.md` — current trace names, safe attributes, and local observability expectations.
