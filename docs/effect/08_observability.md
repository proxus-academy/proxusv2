> Portado de [`Effect-TS/effect/ai-docs/src/08_observability`](https://github.com/Effect-TS/effect/tree/b49284193f86737e411dc3dd19cfb1a8b9fa5d95/ai-docs/src/08_observability) en el commit `b49284193f86737e411dc3dd19cfb1a8b9fa5d95` (licencia MIT).
> Upstream usa Effect `4.0.0-beta.101`; Proxus usa `4.0.0-beta.98`. Verifica los tipos instalados antes de adoptar un ejemplo.


## Observability

Effect has built-in support for structured logging, distributed tracing, and
metrics. For exporting telemetry, use the lightweight Otlp modules from
`effect/unstable/observability` in new projects, or use
`@effect/opentelemetry` NodeSdk when integrating with an existing OpenTelemetry
setup.

## Customizing logging

Source: `08_observability/10_logging.ts`.

```ts
/**
 * @title Customizing logging
 *
 * Configure loggers & log-level filtering for production applications.
 */
import { NodeFileSystem } from "@effect/platform-node"
import { Config, Effect, Layer, Logger, References } from "effect"

// Build a logger layer that emits one JSON line per log entry.
export const JsonLoggerLayer = Logger.layer([Logger.consoleJson])

// Raise the minimum level to "Warn" to skip debug/info logs.
export const WarnAndAbove = Layer.succeed(References.MinimumLogLevel, "Warn")

// There is a built-in logger for writing to a file
export const FileLoggerLayer = Logger.layer([
  Logger.toFile(Logger.formatSimple, "app.log")
]).pipe(
  Layer.provide(NodeFileSystem.layer)
)

// Define a custom logger for app-specific formatting and routing.
export const appLogger = Effect.gen(function*() {
  // Here you could initialize a connection to an external logging service, set
  // up log file rotation, etc.
  yield* Effect.logDebug("initializing app logger")

  return yield* Logger.batched(Logger.formatStructured, {
    window: "1 second",
    flush: Effect.fn(function*(batch) {
      // In a real implementation, this is where you would send the batch of log entries to an external logging service or write them to a file.
      console.log(`Flushing ${batch.length} log entries`)
    })
  })
})

export const AppLoggerLayer = Logger.layer([appLogger]).pipe(
  Layer.provideMerge(WarnAndAbove) // Start with "Warn" level for the app logger.
)

// Create a logger layer that uses the default logger for development, and the
// custom logger for production
export const LoggerLayer = Layer.unwrap(Effect.gen(function*() {
  const env = yield* Config.string("NODE_ENV").pipe(Config.withDefault("development"))
  if (env === "production") {
    return AppLoggerLayer
  }
  return Logger.layer([Logger.defaultLogger])
}))

// Example effect that logs at various levels during a checkout flow.
export const logCheckoutFlow = Effect.gen(function*() {
  yield* Effect.logDebug("loading checkout state")

  yield* Effect.logInfo("validating cart")
  yield* Effect.logWarning("inventory is low for one line item")
  yield* Effect.logError("payment provider timeout")
}).pipe(
  // Attach structured metadata to all log lines emitted by this effect.
  Effect.annotateLogs({
    service: "checkout-api",
    route: "POST /checkout"
  }),
  // Add a duration span so each log line includes checkout=<N>ms metadata.
  Effect.withLogSpan("checkout")
)
```

## Setting up tracing with Otlp modules

Source: `08_observability/20_otlp-tracing.ts`.

```ts
/**
 * @title Setting up tracing with Otlp modules
 *
 * Configure Otlp tracing + log export with a reusable observability layer.
 */
import { NodeRuntime } from "@effect/platform-node"
import { Context, Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { OtlpLogger, OtlpSerialization, OtlpTracer } from "effect/unstable/observability"

// Configure OTLP span export.
export const OtlpTracingLayer = OtlpTracer.layer({
  url: "http://localhost:4318/v1/traces",
  resource: {
    serviceName: "checkout-api",
    serviceVersion: "1.0.0",
    attributes: {
      "deployment.environment": "staging"
    }
  }
})

// Configure OTLP log export.
export const OtlpLoggingLayer = OtlpLogger.layer({
  url: "http://localhost:4318/v1/logs",
  resource: {
    serviceName: "checkout-api",
    serviceVersion: "1.0.0"
  }
})

// Reusable app-wide observability layer.
//
// - OtlpTracer/OtlpLogger require an OTLP serializer and an HttpClient.
// - FetchHttpClient.layer provides the HttpClient used by the exporter.
export const ObservabilityLayer = Layer.merge(OtlpTracingLayer, OtlpLoggingLayer).pipe(
  Layer.provide(OtlpSerialization.layerJson),
  Layer.provide(FetchHttpClient.layer)
)

export class Checkout extends Context.Service<Checkout, {
  processCheckout(orderId: string): Effect.Effect<void>
}>()("acme/Checkout") {
  static readonly layer = Layer.effect(
    Checkout,
    Effect.gen(function*() {
      yield* Effect.logInfo("setting up checkout service")

      return Checkout.of({
        processCheckout: Effect.fn("Checkout.processCheckout")(function*(orderId: string) {
          yield* Effect.logInfo("starting checkout", { orderId })

          yield* Effect.sleep("50 millis").pipe(
            Effect.withSpan("checkout.charge-card"),
            Effect.annotateSpans({
              "checkout.order_id": orderId,
              "checkout.provider": "acme-pay"
            })
          )

          yield* Effect.sleep("20 millis").pipe(
            Effect.withSpan("checkout.persist-order")
          )

          yield* Effect.logInfo("checkout completed", { orderId })
        })
      })
    })
  )
}

// Example usage of the Checkout service.
const CheckoutTest = Layer.effectDiscard(
  Effect.gen(function*() {
    const checkout = yield* Checkout
    yield* checkout.processCheckout("ord_123")
  }).pipe(
    Effect.withSpan("checkout-test-run")
  )
).pipe(
  // You can also attach spans to Layers
  Layer.withSpan("checkout-test"),
  Layer.provide(Checkout.layer)
)

const Main = CheckoutTest.pipe(
  // Provide the observability layer at the very end, so that all spans created
  // by the app are exported.
  Layer.provide(ObservabilityLayer)
)

// Launch the app
Layer.launch(Main).pipe(
  NodeRuntime.runMain
)
```
