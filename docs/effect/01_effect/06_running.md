> Portado de [`Effect-TS/effect/ai-docs/src/01_effect/06_running`](https://github.com/Effect-TS/effect/tree/b49284193f86737e411dc3dd19cfb1a8b9fa5d95/ai-docs/src/01_effect/06_running) en el commit `b49284193f86737e411dc3dd19cfb1a8b9fa5d95` (licencia MIT).
> Upstream usa Effect `4.0.0-beta.101`; Proxus usa `4.0.0-beta.98`. Verifica los tipos instalados antes de adoptar un ejemplo.


## Running Effect programs

## Running effects with NodeRuntime and BunRuntime

Source: `01_effect/06_running/10_run-main.ts`.

```ts
/**
 * @title Running effects with NodeRuntime and BunRuntime
 *
 * Use `NodeRuntime.runMain` to run an Effect program as your process entrypoint.
 */
import { BunRuntime } from "@effect/platform-bun"
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"

const Worker = Layer.effectDiscard(Effect.gen(function*() {
  yield* Effect.logInfo("Starting worker...")
  yield* Effect.forkScoped(Effect.gen(function*() {
    while (true) {
      yield* Effect.logInfo("Working...")
      yield* Effect.sleep("1 second")
    }
  }))
}))

const program = Layer.launch(Worker)

// `runMain` installs SIGINT / SIGTERM handlers and interrupts running fibers
// for graceful shutdown.
NodeRuntime.runMain(program, {
  // Disable automatic error reporting if your app already centralizes it.
  disableErrorReporting: true
})

// Bun has the same API shape:
BunRuntime.runMain(program, { disableErrorReporting: true })
```

## Using Layer.launch as the application entry point

Source: `01_effect/06_running/20_layer-launch.ts`.

```ts
/**
 * @title Using Layer.launch as the application entry point
 *
 * Use `Layer.launch` to run a long-running Effect program as your process entrypoint.
 */
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/unstable/http"
import { createServer } from "node:http"

// Build a tiny HTTP app with a health-check endpoint.
export const HealthRoutes = HttpRouter.use(Effect.fn(function*(router) {
  yield* router.add("GET", "/health", Effect.succeed(HttpServerResponse.text("ok")))
  yield* router.add("GET", "/healthz", Effect.succeed(HttpServerResponse.text("ok")))
}))

// Turn the routes into a server layer and provide the Node HTTP server backend.
export const HttpServerLive = HttpRouter.serve(HealthRoutes).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
)

// `Layer.launch` converts the layer into a long-running Effect<never>.
export const main = Layer.launch(HttpServerLive)

// This entrypoint pattern works well when the whole app is represented as
// layers (for example: HTTP server + background workers).
NodeRuntime.runMain(main)
```
