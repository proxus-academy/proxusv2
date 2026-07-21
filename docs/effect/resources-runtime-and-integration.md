# Effect Resources, Runtime, and Integration

This document defines how this template should acquire resources, compose them into Layers, run long-lived programs, and cross imperative framework seams. It targets Effect v4 (`4.0.0-beta.98` in this repository).

Normative terms such as **MUST**, **SHOULD**, and **MAY** describe required, recommended, and optional practice.

## Operating model

A resource has a lifecycle, not merely a value:

```text
Not acquired
  -> Acquiring
  -> Live
  -> Closing
  -> Closed
```

- **Not acquired**: no external handle exists.
- **Acquiring**: Effect is creating the handle. Acquisition may fail.
- **Live**: callers may use the handle while its owning `Scope` remains open.
- **Closing**: finalizers run after success, failure, or interruption.
- **Closed**: callers MUST NOT retain or reuse the handle.

The owning `Scope` is the lifecycle seam. A Layer is the preferred module for sharing a resource and its interface. A runtime owns the top-level scope that keeps application Layers live.

## Core rules

1. Every external resource that requires cleanup MUST have one explicit owner.
2. Acquisition and release MUST be coupled with `Effect.acquireRelease` or `Effect.acquireUseRelease`; do not rely on a distant `finally` block.
3. A scoped resource MUST NOT escape its scope unless a longer-lived owner assumes responsibility for it.
4. Background fibers MUST be attached to a scope with `Effect.forkScoped` or `Effect.forkIn` unless true process-global detachment is explicitly required.
5. A Layer that creates a resource MUST register cleanup in the same implementation.
6. Runtime entrypoints MUST preserve interruption so process shutdown can close scopes and run finalizers.
7. Imperative integrations MUST build a long-lived `ManagedRuntime` once, reuse it, and dispose it during framework or process shutdown.
8. Finalizers MUST be safe to run during failure and interruption. They SHOULD be idempotent when the underlying library permits it.
9. Cleanup and lifecycle telemetry MUST NOT contain secrets, tokens, raw payloads, or PII.

**Project rule:** Application Layer composition belongs in `apps/server/src/layers/ServerLayers.ts`. Runtime entrypoints use the canonical development or production dependency Layer rather than rebuilding module relationships inline.

**Project rule:** Database configuration validation and pending Effect SQL migrations complete before repositories become available. Normal request handling must not create or mutate schema.

## Scopes and finalizers

### `Effect.acquireRelease`

Use `Effect.acquireRelease(acquire, release)` for a value that remains live for the surrounding scope.

```ts
import { Effect } from "effect"

const connection = Effect.acquireRelease(
  openConnection,
  (handle, exit) => closeConnection(handle, exit)
)

const program = Effect.scoped(
  Effect.gen(function*() {
    const handle = yield* connection
    return yield* useConnection(handle)
  })
)
```

Effect v4 guarantees that successful acquisition registers release with the scope. Acquisition and release run uninterruptibly by default; the release function can inspect the scope's `Exit`. The use phase remains interruptible unless explicitly masked.

Use the optional `{ interruptible: true }` acquisition option only when the underlying acquisition is safely cancelable and partial acquisition cannot leak.

### `Effect.acquireUseRelease`

Use `Effect.acquireUseRelease` for a local bracket when the resource should not be exposed as a scoped value:

```ts
const result = Effect.acquireUseRelease(
  openFile,
  (file) => readFile(file),
  (file, exit) => closeFile(file, exit)
)
```

Acquisition and release are protected from interruption; the use phase can be interrupted. If release can fail, its typed error is part of the resulting effect and must be handled deliberately.

### Lower-level finalizers

- Use `Effect.addFinalizer` to attach cleanup directly to the current scope.
- Use `Effect.ensuring` for non-resource finalization that must run once an effect has started.
- Use `Effect.onExit` when cleanup or reporting depends on the complete `Exit`.
- Use `Effect.onInterrupt` for interruption-specific telemetry or protocol cancellation.

`ensuring` is lower-level than the acquire/release family and SHOULD NOT be the default resource constructor.

## Layers as resource modules

### Resource-providing Layer

Use `Layer.effect` when the Layer provides an interface backed by a managed resource:

```ts
import { Context, Effect, Layer } from "effect"

class MailTransport extends Context.Service<MailTransport, {
  readonly send: (message: Message) => Effect.Effect<void, MailError>
}>()("app/MailTransport") {
  static readonly layer = Layer.effect(
    MailTransport,
    Effect.gen(function*() {
      const transport = yield* Effect.acquireRelease(
        createTransport,
        (transport) => Effect.sync(() => transport.close())
      )

      return MailTransport.of({
        send: Effect.fn("MailTransport.send")((message) =>
          sendWithTransport(transport, message)
        )
      })
    })
  )
}
```

The interface should hide lifecycle mechanics from callers. This gives callers leverage while keeping acquisition, cleanup, configuration, and instrumentation local to one implementation.

### Side-effect-only Layer

Use `Layer.effectDiscard` for infrastructure that must start with the application but provides no callable interface, such as a background maintenance loop.

```ts
const Maintenance = Layer.effectDiscard(
  Effect.gen(function*() {
    yield* maintenanceLoop.pipe(
      Effect.onInterrupt(() => Effect.logInfo("maintenance interrupted")),
      Effect.forkScoped
    )
  })
)
```

The fork MUST be scoped. When the Layer scope closes, the fiber is interrupted and its finalizers run.

### Composition

- Use `Layer.provide` to satisfy a Layer's dependencies locally.
- Keep variants at real seams: for example memory, PGlite, and Postgres adapters implement the same repository interface.
- Do not introduce a Layer that only forwards another Layer without hiding configuration, lifecycle, policy, or composition complexity.
- Share the same Layer instance in a composition graph when callers must share one resource. Do not reconstruct equivalent Layers at each call site.

**Project rule:** Repository adapter families and domain Layers are composed once at the server composition seam. Tests replace adapters through that seam rather than duplicating production composition.

## Dynamic keyed resources with `LayerMap`

Use `LayerMap.Service` when resources are created lazily by key and must be cached, invalidated, and released as a group—for example, one pool per tenant.

Lifecycle by key:

```text
Absent
  -> Building on first get(key)
  -> Cached/live
  -> Invalidated or idle TTL elapsed
  -> Released
  -> Absent (next get rebuilds)
```

Rules:

- `lookup(key)` MUST construct the complete Layer for that key.
- Callers use `Effect.provide(MapService.get(key))`; they SHOULD remain unaware of construction details.
- Configure `idleTimeToLive` only when idle eviction is safe.
- Use `invalidate(key)` when configuration or credentials change and the next access must rebuild.
- Key values and lifecycle logs MUST not expose tenant secrets or sensitive customer data.
- Do not use `LayerMap` as a generic cache for ordinary values; it is for managed Layer lifecycles.

## Running an Effect application

### Native Effect entrypoint

Represent the complete long-running application as a Layer and launch it:

```ts
const AppLive = Layer.mergeAll(HttpServerLive, WorkersLive)
const main = Layer.launch(AppLive)

NodeRuntime.runMain(main)
```

`Layer.launch` builds the Layer and returns a non-terminating effect while the Layer is live. `NodeRuntime.runMain` and `BunRuntime.runMain` install `SIGINT` and `SIGTERM` handling and interrupt running fibers for graceful shutdown.

`disableErrorReporting: true` MAY be used only when the application already has centralized error reporting. Otherwise, leave runtime reporting enabled so defects are visible.

Shutdown sequence:

```text
SIGINT/SIGTERM
  -> runtime interrupts the main fiber
  -> Layer.launch scope closes
  -> scoped child fibers are interrupted
  -> resource finalizers run
  -> process exits
```

A shutdown path SHOULD be bounded by infrastructure-specific limits at the deployment level, but resource finalizers themselves MUST remain correct under interruption semantics.

### Do not run effects in the middle of the graph

`runPromise`, `runSync`, and related execution methods are edge operations. Modules inside the Effect graph MUST return Effects rather than executing them imperatively. Running effects inside domain or repository implementations destroys composition, typed requirements, interruption propagation, and testability.

## Integrating with non-Effect frameworks

Use `ManagedRuntime` when an external framework owns the request loop or callback lifecycle.

```ts
const appMemoMap = Layer.makeMemoMapUnsafe()
const runtime = ManagedRuntime.make(AppLayer, { memoMap: appMemoMap })

framework.get("/items", async () =>
  runtime.runPromise(Items.use((items) => items.list))
)

const shutdown = () => {
  void runtime.dispose()
}
process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)
```

### Managed runtime states

```text
Created, context not built
  -> first run/context request builds Layer lazily
  -> context cached, resources live
  -> run effects repeatedly
  -> dispose/disposeEffect closes runtime scope
  -> disposed; further context use is invalid
```

Rules:

- Construct one runtime per intended resource lifetime, not one per request.
- Reuse a memo map when multiple managed runtimes must share Layer memoization.
- Call `runPromise` only at asynchronous framework edges.
- Use `runSync` only when the integration is truly synchronous; it throws on errors or asynchronous boundaries.
- Use `runCallback` for callback-only interfaces and retain its canceler when the host can cancel work.
- Use `runFork` only when the host will supervise or join the returned fiber.
- Always call `dispose()` or run `disposeEffect` exactly once during host shutdown.
- Translate typed domain failures at the transport adapter; do not flatten all failures into defects at the runtime seam.

**Project rule:** Native Effect server entrypoints should prefer the canonical application Layer and Effect runtime. `ManagedRuntime` is reserved for a genuine imperative host seam, not as an alternative dependency container inside Effect code.

## Interruption and graceful shutdown

Interruption is a lifecycle signal, not an ordinary typed domain failure.

- Blocking Effect operations such as `Effect.sleep` and scoped fibers cooperate with interruption.
- `forkChild` is auto-supervised by its parent. The child terminates when the parent terminates.
- `forkScoped` and `forkIn` tie child lifetime to an explicit scope.
- `forkDetach` attaches to the global scope and can outlive its caller. It SHOULD be avoided for application work because it weakens ownership and shutdown guarantees.
- `Effect.uninterruptible` MUST cover only the smallest critical region.
- Prefer `Effect.uninterruptibleMask` when setup must be atomic but waiting or use phases should restore interruptibility.
- Promise adapters SHOULD receive an Effect-managed `AbortSignal` when the underlying library supports cancellation.

A finalizer MUST avoid indefinite waits. If an external close operation can hang, design its adapter with a bounded and observable shutdown protocol rather than detaching cleanup.

## Observability rules

Resource telemetry should answer: what resource was acquired, how long it stayed live, why it closed, and whether cleanup succeeded—without exposing sensitive data.

- Name operations predictably, for example `SqlTodosRepository.list` or `MailTransport.send`.
- Add spans around meaningful acquisition or shutdown latency, not every trivial Layer constructor.
- Annotate stable resource categories, adapter names, pool sizes, counts, and boolean state.
- Do not annotate connection strings, credentials, emails, tokens, raw SQL, raw payloads, or user-entered text.
- `onInterrupt` MAY log a stable shutdown message for long-running workers.
- Unexpected defects MUST remain visible to runtime/reporting infrastructure.
- If runtime tracing setup changes, update the local observability workflow documentation.

Expected lifecycle trace shape for a resource-backed operation:

```text
http.server <route pattern>
  <DomainModule>.<operation>
    <Adapter>.<operation>
```

Resource acquisition may appear as startup Layer spans; shutdown logs/spans should be separate from request traces.

## Recipes

### Long-running worker Layer

1. Define the loop as an Effect.
2. Make sleeps, queue takes, and external waits interruptible.
3. Attach interruption reporting with safe metadata.
4. Fork with `Effect.forkScoped` inside `Layer.effectDiscard`.
5. Merge the Layer into the application Layer.
6. Launch the full Layer through `NodeRuntime.runMain`.
7. Verify one `SIGTERM` causes loop interruption and finalizer completion.

### Third-party client adapter

1. Read configuration in the Layer that owns the client.
2. Acquire the client with `Effect.acquireRelease`.
3. Convert promise rejection to a typed internal adapter error.
4. Expose a small interface with `Effect.fn` operation names.
5. Release the client in the same Layer.
6. Test success, acquisition failure, operation failure, and interruption/cleanup.

### Imperative framework bridge

1. Compose all required Layers once.
2. Create one `ManagedRuntime` at host startup.
3. Run Effects only in route, hook, job, or callback adapters.
4. Map typed failures at that adapter.
5. Wire cancellation when the host exposes it.
6. Dispose the runtime on every shutdown signal or host close hook.

## Anti-patterns

- Acquiring a pool, socket, client, or transporter with `Effect.sync` and never registering release.
- Returning a scoped handle from `Effect.scoped` and using it after the scope closes.
- Calling `runPromise` inside a domain module or repository adapter.
- Creating `ManagedRuntime` per HTTP request.
- Forgetting `runtime.dispose()` because the process "will exit anyway."
- Starting a background loop without `forkScoped`, `forkIn`, or explicit supervision.
- Using `forkDetach` to silence ownership questions.
- Wrapping a large workflow in `Effect.uninterruptible`.
- Logging credentials, full connection URLs, payloads, or customer data during acquisition or release.
- Creating shallow pass-through Layers that add no lifecycle, configuration, policy, or composition leverage.

## Review checklist

- [ ] Every resource has a named owner and explicit scope.
- [ ] Acquisition and release are colocated.
- [ ] Release runs after success, failure, and interruption.
- [ ] No scoped value escapes its lifetime.
- [ ] Background fibers are supervised and interruptible.
- [ ] Layer composition occurs at the canonical application seam.
- [ ] Runtime execution occurs only at process or framework edges.
- [ ] A `ManagedRuntime`, if present, is reused and disposed.
- [ ] Dynamic keyed resources have an eviction/invalidation policy.
- [ ] Shutdown behavior has been exercised, not merely typechecked.
- [ ] Lifecycle spans/logs use stable names and safe annotations.
- [ ] Typed operational failures remain distinct from defects and interruption.

## Source map

Primary examples and explanations:

- `.repos/effect-smol/ai-docs/src/01_effect/04_resources/index.md` — scopes and finalizers topic.
- `.repos/effect-smol/ai-docs/src/01_effect/04_resources/10_acquire-release.ts` — resource-backed Layer and `Effect.acquireRelease`.
- `.repos/effect-smol/ai-docs/src/01_effect/04_resources/20_layer-side-effects.ts` — `Layer.effectDiscard`, `forkScoped`, and interruption cleanup.
- `.repos/effect-smol/ai-docs/src/01_effect/04_resources/30_layer-map.ts` — keyed dynamic Layers, idle TTL, reuse, and invalidation.
- `.repos/effect-smol/ai-docs/src/01_effect/05_running/10_run-main.ts` — Node/Bun process runners and signal handling.
- `.repos/effect-smol/ai-docs/src/01_effect/05_running/20_layer-launch.ts` — long-running Layer entrypoint.
- `.repos/effect-smol/ai-docs/src/03_integration/10_managed-runtime.ts` — imperative framework bridge, shared memo map, and disposal.

Effect v4 source confirmations:

- `.repos/effect-smol/packages/effect/src/Effect.ts` — `scoped`, acquire/release variants, finalizers, interruption masks, abort signals, and scoped/child/detached forks.
- `.repos/effect-smol/packages/effect/src/ManagedRuntime.ts` — lazy context construction, runtime methods, scope ownership, memoization, and disposal.
- `.repos/effect-smol/packages/effect/src/Layer.ts` — Layer construction, provision, merge, build, and `launch`.
- `.repos/effect-smol/packages/effect/src/LayerMap.ts` — keyed Layer resource lifecycle.

Project rules:

- `AGENTS.md` — canonical backend flow, Layer composition, persistence lifecycle, and observability requirements.
- `docs/architecture.md` — concrete application composition and persistence policies.
- `docs/observability.md` — current span naming, safe annotations, and local trace expectations.
