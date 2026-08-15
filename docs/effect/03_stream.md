> Portado de [`Effect-TS/effect/ai-docs/src/03_stream`](https://github.com/Effect-TS/effect/tree/b49284193f86737e411dc3dd19cfb1a8b9fa5d95/ai-docs/src/03_stream) en el commit `b49284193f86737e411dc3dd19cfb1a8b9fa5d95` (licencia MIT).
> Upstream usa Effect `4.0.0-beta.101`; Proxus usa `4.0.0-beta.100`. Verifica los tipos instalados antes de adoptar un ejemplo.


## Working with Streams

Effect Streams represent effectful, pull-based sequences of values over time.
They let you model finite or infinite data sources.

## Creating streams from common data sources

Source: `03_stream/10_creating-streams.ts`.

```ts
/**
 * @title Creating streams from common data sources
 *
 * Learn how to create streams from various data sources. Includes:
 *
 * - `Stream.fromIterable` for arrays and other iterables
 * - `Stream.fromEffectSchedule` for polling effects
 * - `Stream.paginate` for paginated APIs
 * - `Stream.fromAsyncIterable` for async iterables
 * - `Stream.fromEventListener` for DOM events
 * - `Stream.callback` for any callback-based API
 * - `NodeStream.fromReadable` for Node.js readable streams
 */
import { NodeStream } from "@effect/platform-node"
import { Array, Effect, Queue, Schedule, Schema, Stream } from "effect"
import * as Option from "effect/Option"
import { Readable } from "node:stream"

// `Stream.fromIterable` turns any iterable into a stream.
export const numbers = Stream.fromIterable<number>([1, 2, 3, 4, 5])

// `Stream.fromEffectSchedule` turns a single effect into a polling stream.
// This is useful for metrics, health checks, and cache refresh loops.
export const samples = Stream.fromEffectSchedule(
  Effect.succeed(3),
  Schedule.spaced("30 seconds")
).pipe(
  // Stream.take limits the number of elements emitted by the stream.
  Stream.take(3)
)

// Use `Stream.paginate` when reading APIs that return one page at a time.
// The function returns the current page of values and optionally the next
// cursor.
export const fetchJobsPage = Stream.paginate(
  0, // start with page 0 (the cursor)
  Effect.fn(function*(page) {
    // Simulate network latency
    yield* Effect.sleep("50 millis")

    const results = Array.range(0, 100).map((i) => `Job ${i + 1 + page * 100}`)

    // only return 10 pages of results
    const nextPage = page <= 10
      ? Option.some(page + 1)
      : Option.none()

    return [results, nextPage] as const
  })
)

class LetterError extends Schema.TaggedErrorClass<LetterError>()("LetterError", {
  cause: Schema.Defect()
}) {}

async function* asyncIterable() {
  yield "a"
  yield "b"
  yield "c"
}

// Create a stream from an async iterable.
// The second argument is a function that converts any errors thrown by the
// async iterable into a typed error.
export const letters = Stream.fromAsyncIterable(
  asyncIterable(),
  (cause) => new LetterError({ cause })
)

const button = document.getElementById("my-button")!

// `Stream.fromEventListener` creates a stream from an event listener.
export const events = Stream.fromEventListener<PointerEvent>(button, "click")

// You can also use `Stream.callback` to create a stream from any callback-based
// API.
export const callbackStream = Stream.callback<PointerEvent>(Effect.fn(function*(queue) {
  // You can use the `Queue` apis to emit values into the stream from the
  // callback.
  function onEvent(event: PointerEvent) {
    Queue.offerUnsafe(queue, event)
  }
  // register the event listener and add a finalizer to unregister it when the
  // stream is finished.
  yield* Effect.acquireRelease(
    Effect.sync(() => button.addEventListener("click", onEvent)),
    () => Effect.sync(() => button.removeEventListener("click", onEvent))
  )
}))

export class NodeStreamError extends Schema.TaggedErrorClass<NodeStreamError>()("NodeStreamError", {
  cause: Schema.Defect()
}) {}

// Create a stream from a Node.js readable stream.
//
// It takes options to convert any errors emitted by the stream into a typed
// error, and to evaluate the stream lazily.
export const nodeStream = NodeStream.fromReadable({
  evaluate: () => Readable.from(["Hello", " ", "world", "!"]),
  onError: (cause) => new NodeStreamError({ cause }),
  closeOnDone: true // true by default
})
```

## Consuming and transforming streams

Source: `03_stream/20_consuming-streams.ts`.

```ts
/**
 * @title Consuming and transforming streams
 *
 * How to transform and consume streams using operators like `map`, `flatMap`, `filter`, `mapEffect`, and various `run*` methods.
 */
import { Effect, Sink, Stream } from "effect"

interface Order {
  readonly id: string
  readonly customerId: string
  readonly status: "paid" | "refunded"
  readonly subtotalCents: number
  readonly shippingCents: number
  readonly country: "US" | "CA" | "NZ"
}

interface NormalizedOrder extends Order {
  readonly totalCents: number
}

interface EnrichedOrder extends NormalizedOrder {
  readonly taxCents: number
  readonly grandTotalCents: number
  readonly priority: "normal" | "high"
}

// Start with structured order events from an in-memory source.
export const orderEvents = Stream.succeed<Order>({
  id: "ord_1001",
  customerId: "cus_1",
  status: "paid",
  subtotalCents: 4_500,
  shippingCents: 500,
  country: "US"
})

// Use `Stream.map` for pure per-element transforms.
export const normalizedOrders = orderEvents.pipe(
  Stream.map((order): NormalizedOrder => ({
    ...order,
    totalCents: order.subtotalCents + order.shippingCents
  }))
)

// `Stream.filter` lets you exclude elements that don't match a predicate.
export const paidOrders = normalizedOrders.pipe(
  Stream.filter((order) => order.status === "paid")
)

// Use `Stream.flatMap` to transform each element into a stream, and flatten the
// results.
export const allOrders = Stream.make("US", "CA", "NZ").pipe(
  Stream.flatMap(
    (country) =>
      Stream.range(1, 50).pipe(
        Stream.map((i): Order => ({
          id: `ord_${country}_${i}`,
          customerId: `cus_${i}`,
          status: i % 10 === 0 ? "refunded" : "paid",
          subtotalCents: Math.round(Math.random() * 100_000),
          shippingCents: Math.round(Math.random() * 10_000),
          country
        }))
      ),
    // Optionally control the concurrency of the flatMap with the second argument.
    { concurrency: 2 }
  )
)

const enrichOrder = Effect.fn(function*(order: NormalizedOrder): Effect.fn.Return<EnrichedOrder> {
  // Simulate effectful enrichment (for example, tax/risk lookup).
  yield* Effect.sleep("5 millis")

  const taxRate = order.country === "US" ? 0.08 : 0.13
  const taxCents = Math.round(order.totalCents * taxRate)

  return {
    ...order,
    taxCents,
    grandTotalCents: order.totalCents + taxCents,
    priority: order.totalCents >= 20_000 ? "high" : "normal"
  }
})

// `Stream.mapEffect` performs effectful per-element transforms with concurrency control.
export const enrichedPaidOrders = paidOrders.pipe(
  Stream.mapEffect(enrichOrder, { concurrency: 4 })
)

// `runCollect` gathers all stream outputs into an immutable array.
export const collectedOrders = Stream.runCollect(enrichedPaidOrders)

// `runDrain` runs the stream for its effects, ignoring all outputs.
export const drained = Stream.runDrain(enrichedPaidOrders)

// `runForEach` executes an effectful consumer for every element.
export const logOrders = enrichedPaidOrders.pipe(
  Stream.runForEach((order) => Effect.logInfo(`Order ${order.id} total=$${(order.grandTotalCents / 100).toFixed(2)}`))
)

// `runFold` reduces the stream to one accumulated value.
export const totalRevenueCents = enrichedPaidOrders.pipe(
  Stream.runFold(() => 0, (acc: number, order) => acc + order.grandTotalCents)
)

// `run` lets you consume a stream through any Sink.
export const totalRevenueViaSink = enrichedPaidOrders.pipe(
  Stream.map((order) => order.grandTotalCents),
  Stream.run(Sink.sum)
)

// `runHead` and `runLast` capture edge elements as Option values.
export const firstLargeOrder = enrichedPaidOrders.pipe(
  Stream.filter((order) => order.priority === "high"),
  Stream.runHead
)

export const lastLargeOrder = enrichedPaidOrders.pipe(
  Stream.filter((order) => order.priority === "high"),
  Stream.runLast
)

// Windowing-style operators help shape what downstream consumers see.
export const firstTwoOrders = enrichedPaidOrders.pipe(
  Stream.take(2),
  Stream.runCollect
)

export const afterWarmupOrder = enrichedPaidOrders.pipe(
  Stream.drop(1),
  Stream.runCollect
)

export const untilLargeOrder = enrichedPaidOrders.pipe(
  Stream.takeWhile((order) => order.priority === "normal"),
  Stream.runCollect
)
```

## Decoding and encoding streams

Source: `03_stream/30_encoding.ts`.

```ts
/**
 * @title Decoding and encoding streams
 *
 * Use `Stream.pipeThroughChannel` with the `Ndjson` & `Msgpack` modules to
 * decode and encode streams of structured data.
 */
import { DateTime, Schema, Stream } from "effect"
import { Msgpack, Ndjson } from "effect/unstable/encoding"

// All of the examples below can also be done with Msgpack by replacing `Ndjson`
// with `Msgpack` and using the appropriate channels (`Msgpack.decode()`,
// `Msgpack.encode()`, etc.).
export const msgpackDecoder = Msgpack.decodeSchema(Schema.Struct({
  id: Schema.Number,
  name: Schema.String
}))

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

// A log entry schema representing structured log events. In practice these
// would come from a file, HTTP body, or socket connection.
// `DateTimeUtcFromString` decodes an ISO-8601 string into a `DateTime.Utc`.
class LogEntry extends Schema.Class<LogEntry>("LogEntry")({
  timestamp: Schema.DateTimeUtcFromString,
  level: Schema.Literals(["info", "warn", "error"]),
  message: Schema.String
}) {}

// ---------------------------------------------------------------------------
// Decoding NDJSON strings → objects
// ---------------------------------------------------------------------------

// Suppose we receive raw NDJSON text from a file or network socket.
// `Ndjson.decodeString()` is a Channel that splits incoming strings on
// newlines and `JSON.parse`s each line.
// Pipe the stream through the channel with `Stream.pipeThroughChannel`.
export const decodeUntyped = Stream.make(
  "{\"timestamp\":\"2025-06-01T00:00:00Z\",\"level\":\"info\",\"message\":\"start\"}\n" +
    "{\"timestamp\":\"2025-06-01T00:00:01Z\",\"level\":\"error\",\"message\":\"oops\"}\n"
).pipe(
  Stream.pipeThroughChannel(Ndjson.decodeString()),
  Stream.runCollect
)

// When you need schema validation on top of the raw JSON parse, use
// `Ndjson.decodeSchemaString(Schema)()`. This decodes each line, parses the
// JSON, and then validates each value against the schema — all in one channel.
export const decodeTyped = Stream.make(
  "{\"timestamp\":\"2025-06-01T00:00:00Z\",\"level\":\"info\",\"message\":\"start\"}\n" +
    "{\"timestamp\":\"2025-06-01T00:00:01Z\",\"level\":\"error\",\"message\":\"oops\"}\n"
).pipe(
  Stream.pipeThroughChannel(Ndjson.decodeSchemaString(LogEntry)()),
  Stream.runCollect
)

// ---------------------------------------------------------------------------
// Encoding objects → NDJSON strings
// ---------------------------------------------------------------------------

// `Ndjson.encodeString()` serialises each value to a JSON line.
// The resulting stream emits ready-to-write NDJSON strings.
export const encodeUntyped = Stream.make(
  { timestamp: "2025-06-01T00:00:00Z", level: "info", message: "start" },
  { timestamp: "2025-06-01T00:00:01Z", level: "error", message: "oops" }
).pipe(
  Stream.pipeThroughChannel(Ndjson.encodeString()),
  Stream.runCollect
)

// `Ndjson.encodeSchemaString(Schema)()` encodes each value through the schema
// first (applying any transformations such as date formatting), then
// serialises it to an NDJSON line.
export const encodeTyped = Stream.make(
  new LogEntry({
    timestamp: DateTime.makeUnsafe("2025-06-01T00:00:00Z"),
    level: "info",
    message: "start"
  }),
  new LogEntry({
    timestamp: DateTime.makeUnsafe("2025-06-01T00:00:01Z"),
    level: "error",
    message: "oops"
  })
).pipe(
  Stream.pipeThroughChannel(Ndjson.encodeSchemaString(LogEntry)()),
  Stream.runCollect
)

// ---------------------------------------------------------------------------
// Binary (Uint8Array) variants
// ---------------------------------------------------------------------------

// When working with binary I/O (e.g. TCP sockets, file descriptors) use the
// non-string variants. `Ndjson.decode()` expects `Uint8Array` chunks and
// handles text decoding internally. `Ndjson.encode()` produces `Uint8Array`
// output.
const enc = new TextEncoder()

export const decodeBinary = Stream.make(
  enc.encode("{\"level\":\"info\",\"message\":\"binary\"}\n")
).pipe(
  Stream.pipeThroughChannel(Ndjson.decode()),
  Stream.runCollect
)

export const encodeBinary = Stream.make(
  { level: "info", message: "binary" }
).pipe(
  Stream.pipeThroughChannel(Ndjson.encode()),
  Stream.runCollect
)

// ---------------------------------------------------------------------------
// Handling empty lines
// ---------------------------------------------------------------------------

// NDJSON files sometimes contain blank lines (e.g. trailing newlines or
// pretty-printed output). Pass `{ ignoreEmptyLines: true }` to skip them
// instead of raising an `NdjsonError`.
export const decodeIgnoringBlanks = Stream.make(
  "{\"ok\":true}\n\n{\"ok\":false}\n"
).pipe(
  Stream.pipeThroughChannel(Ndjson.decodeString({ ignoreEmptyLines: true })),
  Stream.runCollect
)

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

// `Ndjson.NdjsonError` is raised when encoding (`kind: "Pack"`) or decoding
// (`kind: "Unpack"`) fails. You can catch it with `Stream.catchTag` or
// `Effect.catchTag`.
export const handleDecodeErrors = Stream.make("not-valid-json\n").pipe(
  Stream.pipeThroughChannel(Ndjson.decodeString()),
  Stream.catchTag("NdjsonError", (err) =>
    // The `kind` field indicates whether the error occurred during
    // encoding ("Pack") or decoding ("Unpack"), and `cause` contains
    // the underlying exception.
    Stream.succeed({ recovered: true, kind: err.kind })),
  Stream.runCollect
)

// ---------------------------------------------------------------------------
// Realistic pipeline: decode → transform → re-encode
// ---------------------------------------------------------------------------

// A common pattern is to read NDJSON, transform each record, and write it
// back as NDJSON. This example filters error-level log entries and re-encodes
// them.
const ndjsonInput = "{\"timestamp\":\"2025-06-01T00:00:00Z\",\"level\":\"info\",\"message\":\"ok\"}\n" +
  "{\"timestamp\":\"2025-06-01T00:00:01Z\",\"level\":\"error\",\"message\":\"fail\"}\n" +
  "{\"timestamp\":\"2025-06-01T00:00:02Z\",\"level\":\"warn\",\"message\":\"slow\"}\n"

export const filterAndReencode = Stream.make(ndjsonInput).pipe(
  // Decode each line into a validated LogEntry
  Stream.pipeThroughChannel(Ndjson.decodeSchemaString(LogEntry)()),
  // Keep only error-level entries
  Stream.filter((entry) => entry.level === "error"),
  // Re-encode the filtered entries back to NDJSON strings
  Stream.pipeThroughChannel(Ndjson.encodeSchemaString(LogEntry)()),
  Stream.runCollect
)
```
