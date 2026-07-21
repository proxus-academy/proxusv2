# Effect Services, Layers, and Configuration

> **Document status:** Required.

This page defines dependency injection, layer composition, resource ownership, and configuration policy for Effect v4 modules in this template. Examples target `effect@4.0.0-beta.98`.

## Policy Levels

- **Required**: must be followed for production modules.
- **Recommended**: the default when its stated condition applies.
- **Available**: supported for a specialized need; do not introduce speculatively.

## When and Why

Use an Effect service when callers need a typed capability whose implementation varies, owns resources, centralizes integration behavior, or forms a real test seam. Use a Layer to construct an adapter, acquire its dependencies, validate configuration, and own its lifecycle.

A service is not automatically a deep module. Its interface must hide meaningful implementation complexity and provide leverage and locality. Apply the deletion test before adding a tag: if deletion merely removes pass-through code and does not force complexity into callers, a plain function may be better. One adapter is a hypothetical seam; production plus a materially different test or persistence adapter makes the seam real.

## Canonical Service Definition

### Required

Use `Context.Service` for capabilities without a built-in default value. Give every tag a globally unique, stable identifier containing the package/application path. Service properties are `readonly`; methods return Effects with `R = never` because construction-time dependencies are captured by the layer.

```ts
import { Context, Effect, Layer, Schema } from "effect"

export class MailError extends Schema.TaggedErrorClass<MailError>()(
  "MailError",
  { operation: Schema.String, cause: Schema.Defect },
) {}

export class Mailer extends Context.Service<Mailer, {
  readonly sendWelcome: (email: string) => Effect.Effect<void, MailError>
}>()("app/modules/auth/Mailer") {
  static readonly layerNoDeps: Layer.Layer<Mailer, never, MailTransport> =
    Layer.effect(
      Mailer,
      Effect.gen(function*() {
        const transport = yield* MailTransport

        const sendWelcome = Effect.fn("Mailer.sendWelcome")(function*(email: string) {
          return yield* transport.send({
            to: email,
            subject: "Welcome",
          })
        })

        return Mailer.of({ sendWelcome })
      }),
    )
}
```

### Required rules

- Define the interface before the live adapter when designing a new module.
- Keep the interface small but behaviorally meaningful: types, invariants, expected errors, ordering, and configuration assumptions are all part of it.
- Use `Effect.fn("Service.operation")` for methods.
- Acquire dependencies once during layer construction and close over them.
- Return `Service.of({...})` when it preserves useful type checking and clarity.
- Keep HTTP DTO adaptation out of backend services and storage mechanics out of domain services.
- In this repository, preserve `HTTP handler -> Service/use-case Module -> Repository Interface -> Adapter`.

### Anti-patterns

- A tag for every helper function.
- Service methods whose `R` exposes construction dependencies to every caller.
- Mutable objects exposed directly through the interface.
- Transport handlers calling repositories directly.
- Repository interfaces that accept HTTP request DTOs or return UI models.
- Generic `Error` or arbitrary Promise rejection values in method error channels.
- A global service locator or hidden `Effect.provide` inside business operations.

## `Context.Reference`

### Available

Use `Context.Reference` only for a value with an intentional, safe default, such as a local feature flag or tuning value. The default is part of the interface.

```ts
import { Context } from "effect"

export const FeatureEnabled = Context.Reference<boolean>(
  "app/features/FeatureEnabled",
  { defaultValue: () => false },
)
```

Do not use a reference to make required credentials, endpoints, tenant identity, or other correctness-critical configuration silently optional.

## Constructing Layers

### Required

- Use `Layer.succeed` for an already-built, non-resourceful adapter.
- Use `Layer.sync` for synchronous construction.
- Use `Layer.effect` for effectful construction and scoped acquisition.
- Use `Effect.acquireRelease` inside layer construction for resources that must close.
- Name variants by role: `layer`, `layerNoDeps`, `testLayer`, `memoryLayer`, `pgliteLayer`, `postgresLayer`.
- Keep application graph composition in the canonical composition root, currently `apps/server/src/layers/ServerLayers.ts`.

```ts
export const MailerLive = Mailer.layerNoDeps.pipe(
  Layer.provide(SmtpTransport.layer),
)
```

`Layer.provide` satisfies dependencies and exposes the outer layer's outputs. `Layer.provideMerge` also keeps the provided layer's outputs visible. Use `provideMerge` only when downstream code or tests genuinely need both interfaces.

### Layer memoization

**Required:** store parameterized resource layers in a constant before using them in multiple branches. Layer memoization is based on reference identity.

```ts
const postgresLayer = Postgres.layer({ url: databaseUrl })

const repositories = Layer.merge(
  UsersRepository.postgresLayer.pipe(Layer.provide(postgresLayer)),
  TodosRepository.postgresLayer.pipe(Layer.provide(postgresLayer)),
)
```

Calling the constructor twice creates two layer values and can create two pools.

### Provide once

**Required:** compose the application graph centrally and provide it at the runtime or test root. Local `Layer.provide` inside layer definitions is appropriate for satisfying construction dependencies; scattered `Effect.provide` calls in product logic are not.

This gives one visible dependency graph, makes adapters replaceable in tests, and concentrates module relationship knowledge.

## Dynamic and Background Layers

### Available

- `Layer.unwrap(effectOfLayer)`: choose or construct a layer from Effect/configuration.
- `Layer.effectDiscard(effect)`: initialization or scoped background behavior that intentionally provides no service.
- `LayerMap.Service`: keyed, lazily built, cached resources with lifecycle management.
- `Layer.launch(layer)`: run a long-lived assembled application.

Use `Layer.unwrap` when configuration determines which concrete adapter to build:

```ts
const StoreLive = Layer.unwrap(
  Effect.gen(function*() {
    const inMemory = yield* Config.boolean("STORE_IN_MEMORY").pipe(
      Config.withDefault(false),
    )
    if (inMemory) return Store.memoryLayer

    const url = yield* Config.url("STORE_URL")
    return Store.remoteLayer(url)
  }),
)
```

The example demonstrates the API. In production template code, adapter selection must remain explicit and documented; do not silently fall back from a required production adapter to memory.

Use `Effect.forkScoped` inside `Layer.effectDiscard` for owned background fibers. Use `LayerMap.Service` only for a real dynamic key such as tenant-specific pools, with an explicit idle lifecycle and invalidation policy.

## Configuration Ownership

### Required

Configuration belongs to the service or module that consumes it. Runtime bootstrap may compose config layers, but it must not own a global mega-config containing unrelated domains.

Examples:

- database URL/pool settings belong with database infrastructure;
- JWT issuer/audience/secret belong with token/session infrastructure;
- HTTP port belongs with server startup;
- OTLP endpoint/service metadata belong with observability setup;
- a foreign integration's token and model ID belong with that integration.

The shared HTTP contract must not contain runtime configuration, secrets, database settings, or browser state.

### Required, optional, and defaulted config

Classify each value deliberately:

| Classification | Status | Pattern | Meaning |
| --- | --- | --- | --- |
| Required | **Required by default** | `Config.nonEmptyString("NAME")` | Missing/invalid config fails layer startup |
| Optional | **Available** | `Config.option(Config.string("NAME"))` | Absence is a valid domain/runtime state |
| Optional with default | **Available** | `Config.int("NAME").pipe(Config.withDefault(12))` | The fallback is intentional product/runtime behavior |

Do not make a value optional merely to simplify local setup. Critical configuration must fail early and clearly.

### Typed constructors

**Required:** prefer typed constructors over parsing `process.env`:

```ts
const token = yield* Config.redacted("API_TOKEN")
const host = yield* Config.nonEmptyString("API_HOST")
const port = yield* Config.port("PORT")
const retries = yield* Config.int("REQUEST_RETRIES")
const enabled = yield* Config.boolean("FEATURE_ENABLED")
const endpoint = yield* Config.url("API_URL")
```

Use `Config.redacted` for tokens, passwords, private keys, and credentials. Extract a secret with `Redacted.value` only at the foreign-call seam, and never log the extracted value.

For richer validation and reusable transformations, `Config.schema` is **Recommended**:

```ts
import { Config, Schema } from "effect"

const Environment = Schema.Literals([
  "development",
  "staging",
  "production",
])

const environment = yield* Config.schema(Environment, "NODE_ENV")
```

Use schema checks/brands for critical ranges and semantic values. A built-in typed constructor such as `Config.port` remains preferable when it already expresses the rule.

### Config services

A dedicated config service is **Recommended** when several methods/layers consume one coherent config domain or tests should inject typed values directly.

```ts
import { Config, Context, Effect, Layer, Redacted } from "effect"

export class ApiConfig extends Context.Service<ApiConfig, {
  readonly apiKey: Redacted.Redacted
  readonly baseUrl: URL
  readonly timeoutMs: number
}>()("app/integrations/api/ApiConfig") {
  static readonly layer = Layer.effect(
    ApiConfig,
    Effect.gen(function*() {
      const apiKey = yield* Config.redacted("API_KEY")
      const baseUrl = yield* Config.url("API_BASE_URL")
      const timeoutMs = yield* Config.int("API_TIMEOUT_MS").pipe(
        Config.withDefault(5_000),
      )
      return ApiConfig.of({ apiKey, baseUrl, timeoutMs })
    }),
  )
}
```

The default above is valid only if five seconds is an intentional documented policy. Otherwise make the value required.

### Config providers

`ConfigProvider.layer` is **Available** to replace environment lookup at the runtime/test root. Production uses environment variables by default. Tests should normally provide a typed config service directly with `Layer.succeed`; use a custom provider when the configuration parsing itself is under test.

### Anti-patterns

```ts
Number(process.env.PORT ?? "3000")
(process.env.FEATURE_ENABLED ?? "true") !== "false"
process.env.API_TOKEN ?? "dev-token"
```

Also prohibited:

- reading `process.env` throughout services;
- one `AppConfig` containing every variable;
- hardcoded production credentials or committed secrets;
- hidden fallback to mocks/memory when required config is absent;
- defaults for correctness-critical identity, auth, or persistence values;
- logging config objects that contain secrets;
- parsing the same environment variable differently in multiple modules.

## Startup Failure Policy

### Required

Layer construction must validate required configuration before accepting traffic or starting dependent background work. A missing or invalid required value is an intentional startup failure. Keep the original `Config.ConfigError` information available to top-level diagnostics, while ensuring secrets remain redacted.

Do not use `Effect.orDie` inside reusable modules merely to erase configuration errors. The runtime entrypoint may establish final defect/reporting policy, but startup diagnostics must remain actionable.

## Testing Implications

- Provide fresh stateful layers per test by default.
- Use `Layer.succeed(ConfigService, values)` for business tests; do not mutate global environment variables.
- Test config parsing separately with a `ConfigProvider` for missing, malformed, boundary, optional, and defaulted values.
- Verify required config prevents layer construction.
- Verify resource layers release on success, failure, and interruption.
- Test each real adapter through the same service/repository interface where behavior must agree.
- Use suite-shared layers only for expensive resources, and reset mutable state between tests.

```ts
const TestApiConfig = Layer.succeed(ApiConfig, {
  apiKey: Redacted.make("test-key"),
  baseUrl: new URL("https://api.test"),
  timeoutMs: 50,
})
```

## Observability Implications

- Name service methods and adapter operations with stable `Effect.fn` names.
- Add startup spans around expensive layer construction and resource acquisition when useful.
- Annotate adapter kind, operation, and safe endpoint host; never annotate URLs containing credentials or secret values.
- A config failure should identify the variable and owning module without printing its value.
- Emit shutdown/finalizer failures at the resource-owning seam.
- Provide the observability layer late enough in composition that application layer construction and operations can export spans.

## Checklist

### Required

- [ ] The service interface hides meaningful behavior and has a real seam.
- [ ] The tag identifier is globally unique and stable.
- [ ] Methods are readonly, named with `Effect.fn`, and have no leaked construction requirements.
- [ ] Dependencies are acquired by the layer and provided at the composition root.
- [ ] Parameterized resource layer values are reused by reference.
- [ ] Resources and background fibers are scoped.
- [ ] Configuration is local to its consuming module.
- [ ] Required values have no fallback; secrets use `Config.redacted`.
- [ ] Startup fails on missing/invalid required config.

### Recommended/Available

- [ ] A config service exists only for a coherent reused config domain.
- [ ] `Config.schema` handles validation not covered by built-in constructors.
- [ ] `provideMerge`, `Layer.unwrap`, `LayerMap`, and shared test layers are used only for their stated need.
- [ ] Test adapters exercise the same interface without leaking production implementation details.
- [ ] Layer startup, operation, and shutdown are observable without secret leakage.

## Source Map

### Local sources

- `.repos/effect-smol/ai-docs/src/01_effect/02_services/01_service.ts`
- `.repos/effect-smol/ai-docs/src/01_effect/02_services/10_reference.ts`
- `.repos/effect-smol/ai-docs/src/01_effect/02_services/20_layer-composition.ts`
- `.repos/effect-smol/ai-docs/src/01_effect/02_services/20_layer-unwrap.ts`
- `.repos/effect-smol/ai-docs/src/01_effect/04_resources/10_acquire-release.ts`
- `.repos/effect-smol/ai-docs/src/01_effect/04_resources/20_layer-side-effects.ts`
- `.repos/effect-smol/ai-docs/src/01_effect/04_resources/30_layer-map.ts`
- `.repos/effect-smol/ai-docs/src/01_effect/05_running/20_layer-launch.ts`
- `.repos/effect-smol/ai-docs/src/08_observability/20_otlp-tracing.ts`
- `.repos/effect-smol/ai-docs/src/09_testing/20_layer-tests.ts`
- `.agents/skills/effect-service-config/references/config-rules.md`
- `apps/server/src/layers/ServerLayers.ts`

### External sources

- Effect Solutions, Services & Layers: https://www.effect.solutions/services-and-layers
- Effect Solutions, Config: https://www.effect.solutions/config
- Effect Solutions, Testing: https://www.effect.solutions/testing
- Effect Solutions, Service `use` pattern: https://www.effect.solutions/use-pattern

Effect Solutions is a prescriptive community guide. Configuration strictness, centralized server composition, repository adapters, and the canonical request flow are template policy, not attributed to upstream.
