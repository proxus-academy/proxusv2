# Effect Programs

> **Document status:** Required.

This page defines how to construct, compose, instrument, and run Effect v4 programs in this template. Examples target `effect@4.0.0-beta.98`.

## Policy Levels

- **Required**: the default for production code.
- **Recommended**: preferred when its stated condition applies.
- **Available**: use only when the problem requires it.

## When and Why

Use an Effect whenever work can fail, require runtime capabilities, perform side effects, be interrupted, acquire resources, run concurrently, or benefit from structured logging/tracing. Keep ordinary deterministic transformations as plain TypeScript functions.

The type `Effect.Effect<A, E, R>` records:

- `A`: success value;
- `E`: expected failure value;
- `R`: required services.

This is the v4 type parameter order. Do not infer it from older Effect examples.

## Constructing Effects

### Required constructors

Choose the constructor that truthfully describes the source:

| Source | Constructor | Failure behavior |
| --- | --- | --- |
| Value already in memory | `Effect.succeed(value)` | Cannot fail |
| Synchronous side effect that must not throw | `Effect.sync(thunk)` | A throw is a defect |
| Synchronous API that may throw | `Effect.try({ try, catch })` | Maps throws to typed failure |
| Promise API that may reject/throw | `Effect.tryPromise({ try, catch })` | Maps rejection/throw to typed failure and can receive an `AbortSignal` |
| Nullish value | `Effect.fromNullishOr(value)` | Produces a typed missing-value failure after mapping |
| Callback API | `Effect.callback(register)` | Supports resumption and an interruption finalizer |

```ts
import { Effect, Schema } from "effect"

class InvalidJson extends Schema.TaggedErrorClass<InvalidJson>()(
  "InvalidJson",
  { cause: Schema.Defect },
) {}

export const decodeJson = Effect.fn("Json.decode")((input: string) =>
  Effect.try({
    try: () => JSON.parse(input),
    catch: (cause) => new InvalidJson({ cause }),
  }),
)
```

### Required rules

- Wrap all throwing and rejecting foreign code at the integration seam.
- Preserve cancellation by passing the `AbortSignal` supplied to `Effect.tryPromise` when the foreign API supports it.
- Map foreign failures to a typed module error; do not leak arbitrary rejection values.
- Use `Schema.Defect` for an unknown underlying cause that must be safely represented.
- Do not use `Effect.sync` around code known to throw.

```ts
const requestJson = Effect.fn("RemoteUsers.requestJson")((url: string) =>
  Effect.tryPromise({
    try: (signal) => fetch(url, { signal }).then((response) => response.json()),
    catch: (cause) => new RemoteUsersError({ operation: "requestJson", cause }),
  }),
)
```

## Sequencing with `Effect.gen`

### Required

Use `Effect.gen` for a one-off program whose sequential control flow is clearer in generator syntax. Use `yield*` to obtain success values, services, or failures.

```ts
const program = Effect.gen(function*() {
  yield* Effect.logInfo("Starting import")
  const payload = yield* loadPayload
  const decoded = yield* decodePayload(payload)
  return yield* persistDecoded(decoded)
})
```

When raising a yieldable tagged error in a branch, return it so TypeScript understands that execution stops:

```ts
if (payload.length === 0) {
  return yield* new EmptyPayload({ source: "upload" })
}
```

Do not wrap every `map` in `Effect.gen`; use `Effect.map`, `Effect.flatMap`, and `pipe` when they remain simpler.

## Naming Effectful Functions with `Effect.fn`

### Required

Use `Effect.fn("Module.operation")` for named effectful functions, especially service methods, use cases, repository operations, and remote calls. Names must be stable, low-cardinality, and match the operation.

```ts
export const normalizeAndSave = Effect.fn("Documents.normalizeAndSave")(
  function*(raw: string): Effect.fn.Return<Document, SaveError> {
    const document = yield* decodeDocument(raw)
    return yield* saveDocument(document)
  },
  Effect.annotateLogs({ module: "documents" }),
)
```

`Effect.fn` adds call-site tracing. Pass whole-effect transformations as additional arguments. In this template, do not call `.pipe(...)` on the function returned by `Effect.fn`; keep function-level instrumentation visible in the `Effect.fn` declaration and pipe individual invocations when call-site behavior truly differs.

### Anti-patterns

```ts
// Avoid: a named function that recreates an anonymous Effect.gen.
const save = (input: Input) => Effect.gen(function*() {
  // ...
})

// Avoid: untracked Promise and thrown error channels.
const save = async (input: Input) => {
  throw new Error("failed")
}
```

## Composition and Control Flow

### Required

- Use `pipe` for effect transformations such as mapping, retry, timeout, logging, and span annotation.
- Keep business sequencing inside the owning service/use-case Module.
- Keep structural parsing at input seams and persistence mechanics in repository adapters.
- Keep expected failures in the typed error channel until the seam that intentionally handles or maps them.
- Preserve interruption; do not detach unmanaged Promise work or fibers.

### Retry and timeout

**Recommended** for fallible remote operations, but only after classifying failures. Retry transient failures, not validation, authorization, conflicts, or arbitrary defects.

```ts
import { Effect, Schedule } from "effect"

const retryPolicy = Schedule.exponential("100 millis").pipe(
  Schedule.both(Schedule.recurs(3)),
)

const resilientCall = callRemote.pipe(
  Effect.timeout("2 seconds"),
  Effect.retry(retryPolicy),
  Effect.timeout("10 seconds"),
)
```

The inner timeout limits each attempt; the outer timeout limits the complete operation. Record retry/timeout policy at the integration seam and test it with virtual time.

### Anti-patterns

- Retrying every typed error.
- An unbounded retry schedule in request handling.
- Swallowing failures with a generic fallback that changes product semantics.
- Repeating timeout/retry policy at many callers instead of concentrating it in one deep integration module.
- Logging and rethrowing the same failure at every layer, creating duplicate noise.

## Third-Party Promise Libraries: the `use` Pattern

### Available

Use a callback-based `use` method when a third-party library has many Promise methods, supports `AbortSignal`, and has no native Effect integration. For a small interface, explicit methods wrapped with `Effect.tryPromise` are deeper and easier to understand.

```ts
import { Context, Effect, Layer, Schema } from "effect"

class ClientError extends Schema.TaggedErrorClass<ClientError>()(
  "ClientError",
  { operation: Schema.String, cause: Schema.Defect },
) {}

type Client = {
  readonly read: (key: string, options: { signal: AbortSignal }) => Promise<string>
}

export class ForeignClient extends Context.Service<ForeignClient, {
  readonly use: <A>(
    operation: string,
    f: (client: Client, signal: AbortSignal) => Promise<A>,
  ) => Effect.Effect<A, ClientError>
}>()("app/integrations/ForeignClient") {
  static readonly layer = (client: Client) =>
    Layer.succeed(ForeignClient, {
      use: (operation, f) =>
        Effect.tryPromise({
          try: (signal) => f(client, signal),
          catch: (cause) => new ClientError({ operation, cause }),
        }),
    })
}
```

The callback preserves encapsulation, automatic failure mapping, and interruption. Add explicit convenience methods for common product operations. Do not expose a raw client if doing so lets callers bypass those guarantees.

This pattern is **Available**, not mandatory. The repository's persistence policy still forbids adding Drizzle adapters and requires Effect SQL repositories with `SqlSchema`.

## Resources and Scope

### Required

Use `Effect.acquireRelease` for resources that must close, and acquire them while building a scoped layer. The release action runs when the layer scope closes, including interruption.

```ts
const connection = yield* Effect.acquireRelease(
  openConnection,
  (connection) => Effect.sync(() => connection.close()),
)
```

Use `Effect.forkScoped` for background fibers owned by a layer. Use `Layer.effectDiscard` when initialization/background work provides no service interface. Do not use it to hide a capability that callers should depend on explicitly.

### Available

- `LayerMap.Service`: dynamic, keyed, lifecycle-managed resources such as tenant pools. Introduce only when keyed runtime allocation is a real requirement.
- `Layer.launch`: convert an assembled long-running layer into `Effect<never>`.
- `Effect.callback`: bridge callback APIs with a finalizer that cancels the source.

### Anti-patterns

- Opening sockets, pools, files, or workers at module import time.
- Starting a background task without `forkScoped` or another explicit owner.
- Closing resources manually at random call sites.
- Introducing `LayerMap` for a static dependency graph.

## Running Programs

### Required on Node.js

Use `NodeRuntime.runMain` at the process entrypoint. It installs signal handling and interrupts fibers for graceful shutdown.

```ts
import { NodeRuntime } from "@effect/platform-node"
import { Layer } from "effect"

const main = Layer.launch(AppLive)

NodeRuntime.runMain(main)
```

Provide the application layer at the composition root, not throughout business code. Long-running applications may be represented entirely by layers and launched with `Layer.launch`. Libraries must return Effects; they must not call `runPromise` internally.

### Anti-patterns

- `Effect.runPromise` scattered through service methods or adapters.
- Multiple runtime roots inside one application.
- Process signal handlers that bypass scoped Effect shutdown.
- `disableErrorReporting: true` without another verified top-level reporting mechanism.

## Testing Implications

- Use `it.effect` from `@effect/vitest` for Effect programs and scoped cleanup.
- Use `TestClock` for sleeps, retry, backoff, timeout, and scheduled work; use `it.live` only when real time is the behavior under test.
- Test the typed failure channel with tags and semantic fields, not rendered stack strings.
- Verify interruption of callback/Promise integrations by asserting their abort/finalizer path.
- Give each stateful test a fresh layer by default. Share a layer only for an intentionally expensive suite resource and reset state explicitly.
- Test through the module interface. If tests repeatedly reach past it, reconsider the module's depth and seam.

## Observability Implications

- Name `Effect.fn` operations as `Module.operation`; avoid IDs, URLs, or user content in span names.
- Add `Effect.withSpan` to meaningful one-off workflows and `Effect.annotateSpans`/`Effect.annotateLogs` only with safe, bounded metadata.
- Log once at the seam that has enough context to act. Expected errors do not need repeated error logs at every layer.
- Never annotate raw passwords, tokens, email addresses, request bodies, document text, or foreign exception objects.
- Background layers must emit a startup signal and make interruption/shutdown diagnosable.

## Checklist

### Required

- [ ] The constructor matches the side-effect source and failure behavior.
- [ ] Throwing/rejecting foreign code maps to a typed error.
- [ ] Cancellation signals and finalizers are preserved.
- [ ] Named effectful functions use stable `Effect.fn` names.
- [ ] Expected failures remain typed until intentionally handled.
- [ ] Resources and child fibers have a scope owner.
- [ ] Runtime execution occurs only at the application entrypoint.

### Recommended/Available

- [ ] Retry targets only classified transient failures and has finite limits.
- [ ] Timeout placement distinguishes per-attempt and overall limits.
- [ ] The `use` pattern is used only for a broad foreign Promise interface.
- [ ] Time, interruption, and cleanup behavior have deterministic tests.
- [ ] Spans and annotations are safe and low-cardinality.

## Source Map

### Local sources

- `.repos/effect-smol/ai-docs/src/01_effect/01_basics/01_effect-gen.ts`
- `.repos/effect-smol/ai-docs/src/01_effect/01_basics/02_effect-fn.ts`
- `.repos/effect-smol/ai-docs/src/01_effect/01_basics/10_creating-effects.ts`
- `.repos/effect-smol/ai-docs/src/01_effect/04_resources/10_acquire-release.ts`
- `.repos/effect-smol/ai-docs/src/01_effect/04_resources/20_layer-side-effects.ts`
- `.repos/effect-smol/ai-docs/src/01_effect/04_resources/30_layer-map.ts`
- `.repos/effect-smol/ai-docs/src/01_effect/05_running/10_run-main.ts`
- `.repos/effect-smol/ai-docs/src/01_effect/05_running/20_layer-launch.ts`
- `.repos/effect-smol/ai-docs/src/08_observability/10_logging.ts`
- `.repos/effect-smol/ai-docs/src/08_observability/20_otlp-tracing.ts`
- `.repos/effect-smol/ai-docs/src/09_testing/10_effect-tests.ts`

### External sources

- Effect Solutions, Basics: https://www.effect.solutions/basics
- Effect Solutions, Service `use` pattern: https://www.effect.solutions/use-pattern
- Effect Solutions, Testing: https://www.effect.solutions/testing

Effect Solutions supplies prescriptive upstream-community examples. Repository-specific layering, persistence, privacy, and naming rules above are template policy.
