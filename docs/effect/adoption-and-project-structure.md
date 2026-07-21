# Effect adoption and project structure

> **Version:** Effect v4 beta. This repository currently pins `effect@4.0.0-beta.98`. Pin one exact beta across workspace packages and validate every upgrade; beta APIs can change before v4 stable.
>
> **Source maturity warning:** [effect.solutions/project-structure](https://www.effect.solutions/project-structure) is a `TODO` page, and [effect.solutions/incremental-adoption](https://www.effect.solutions/incremental-adoption) is only a `Proposed Outline`. They are drafts/schemes, not completed normative guidance. This document preserves their topics but completes them **only with repository rules**, each explicitly labeled **Project rule**. It does not attribute those completions to Effect Solutions.

## Status and authority

The Effect Solutions project-structure draft lists these unfinished topics:

- recommended folders;
- placement of services, schemas, config, and errors;
- monorepo versus single-package organization;
- module seams and dependency direction;
- examples for CLI, HTTP API, library, and full-stack applications.

The incremental-adoption outline proposes:

1. Promise interop;
2. where to start;
3. wrapping external libraries;
4. framework integration;
5. gradual service introduction;
6. resources.

**Project rule — authority:** `AGENTS.md` and `docs/*` define this template's concrete architecture. Bounded contexts and cross-module rules: [`../architecture/domain-driven-architecture.md`](../architecture/domain-driven-architecture.md). Skills define canonical implementation/review patterns. Existing example code is integration context, not architectural authority when it conflicts with those rules.

**Project rule — beta/unstable APIs:** pin exact v4 beta versions. Any `effect/unstable/*` import must be clearly marked, localized behind an application-owned module, and reassessed on upgrade. Shared public contracts must not expose unstable implementation types.

## Recommended workspace structure

**Project rule:** this repository is a pnpm full-stack monorepo:

```text
apps/
  server/
    src/
      database/          # SQL clients, migrations, seed infrastructure
      errors/            # cross-cutting server-only errors
      http/              # HTTP assembly and middleware
      layers/            # application composition
      modules/<module>/  # product/capability implementation
      observability/     # tracing/runtime telemetry
      test/              # reusable backend test infrastructure
  web/                  # and apps/mobile-web when needed
    src/
      api/                # runtime API client/config
      components/
        ui/               # shadcn primitives
        patterns/         # reusable screen/layout patterns
        screen-parts/     # non-module screen-specific presentation
        screens/          # thin route-level composition
      modules/<module>/   # feature atoms and components
      test/               # frontend test infrastructure
packages/
  shared/
    src/
      api.ts              # shared API root
      modules/<module>/   # runtime-neutral contracts
```

**Project rule — dependency direction:**

```text
packages/shared <- apps/server
packages/shared <- apps/web
packages/shared <- apps/mobile-web

HTTP handler -> service/use-case module -> repository interface -> adapter
screen/component -> feature atom -> typed API client
```

`packages/shared` must not import an app. The server and client apps (`web`, `mobile-web`) may depend on shared. Cross-module imports go through the target module's `index.ts`; `internal/` remains private. Enforce the dependency graph with:

```bash
pnpm boundaries
pnpm verify:architecture
```

## Placement of schemas, errors, configuration, and entrypoints

### Shared contract

**Project rule:** a shared product module uses:

```text
packages/shared/src/modules/<module>/
  schema.ts       # domain/runtime schemas and branded public UUID IDs
  contract.ts     # request/response DTOs
  errors.ts       # expected client-visible typed errors
  api.ts          # HttpApi group/endpoints
  middleware.ts   # only when the shared middleware contract is needed
  index.ts        # public module interface
```

Expected failures on which a client branches belong in the shared contract with explicit HTTP status/body definitions. Runtime-neutral shared code must not depend on Node, SQL, React, or unstable infrastructure types.

### Backend module

**Project rule:** server product modules are flat by default:

```text
apps/server/src/modules/<module>/
  handlers.ts
  service.ts
  service.live.ts
  repository.ts
  repository.memory.ts
  repository.sql.ts
  repository.postgres.ts
  *.test.ts
  index.ts
```

The handler adapts transport only. The service owns product behavior, ID generation with `Random.nextUUIDv4`, normalization, scope/authorization decisions, repository coordination, transactions for multi-repository invariants, and conversion to shared models. `repository.ts` owns storage-agnostic repository input/record schemas and its interface. Adapters are flat query implementations and contain no product behavior.

**Project rule — deep modules:** prefer an application module whose small interface hides provider, process, SQL, retry, lifecycle, and protocol mechanics. Apply the deletion test: if removing a module only moves the same complexity into every caller, the module was providing locality and leverage; if complexity disappears, it was likely a pass-through. One adapter is a hypothetical seam; memory plus SQL, fake plus live, or provider A plus provider B makes it a real seam. The interface is the test surface.

### Configuration

**Project rule:** configuration belongs next to the service or layer that consumes it. Do not create a global mega-config unless multiple modules truly share one config domain.

```ts
import { Config, Effect, Layer } from "effect"

const ExternalClientLayer = Layer.unwrap(Effect.gen(function*() {
  const apiKey = yield* Config.redacted("EXTERNAL_API_KEY")
  const timeoutMs = yield* Config.int("EXTERNAL_TIMEOUT_MS")
  return makeExternalClientLayer({ apiKey, timeoutMs })
}))
```

Required configuration has no default and fails initialization. Optional values use `Config.option` only when absence has an intentional behavior. Defaults use `Config.withDefault` only when the fallback is product behavior, not developer convenience. Prefer typed constructors (`nonEmptyString`, `int`, `port`, `boolean`, `redacted`) over `process.env` and manual parsing.

### Entrypoints and layer composition

**Project rule:** entrypoints are thin. Backend composition lives in `apps/server/src/layers/ServerLayers.ts`. Runtime entrypoints consume `DevServerDependenciesLayer` or `ProdServerDependenciesLayer` rather than assembling modules ad hoc. Keep repository-family composition, product-domain composition, transport, and runtime launch as distinct seams.

**Project rule:** lifecycle ownership belongs at the runtime edge. Startup validates required config and runs registered Effect SQL migrations before repositories serve requests. `Layer`/`Scope` own acquired resources; shutdown interrupts work and closes scoped resources. Do not scatter `process.on`, `process.exit`, unmanaged promises, or resource acquisition through product modules.

## Application shapes from the draft topics

The Effect Solutions page only asks for examples; the structures below are repository-specific completions.

### CLI application

**Project rule:** place command definitions in a transport/entry module, use typed CLI inputs, and call application modules. Put child-process/file/network implementations behind adapters. Keep `effect/unstable/cli` and `effect/unstable/process` imports local and marked unstable. The entrypoint provides platform/application layers and calls the platform runtime. CLI handlers do not become alternate domain services.

### HTTP API

**Project rule:** define the runtime-neutral contract in `packages/shared`, implement handlers in the corresponding server module, and preserve:

```text
HTTP handler -> service/use-case module -> repository interface -> adapter
```

Handlers must not import repositories. Client-visible errors are shared typed errors. Repository/internal failures map at the HTTP error seam to safe `InternalServerError` responses.

### Library

**Project rule:** expose schemas, constructors, operations, and required services through a deliberate package/module `index.ts`. Keep `internal/` private. Do not require a runtime at import time. Keep Node/browser/provider adapters separate from the runtime-neutral interface, and do not leak unstable types through the public interface.

### Full-stack application

**Project rule:** organize product capabilities vertically across the same `<module>` under shared, server, and client app roots. Client apps consume the shared contract through a typed client and feature atoms; screens do not fetch directly. Relationship-bearing resources must also consider parent-detail lists, scoped create/update flows, scoped atoms, and deep links rather than only a global collection.

## Incremental adoption

### 1. Promise interop

The draft names `Effect.tryPromise` / `Effect.promise` for wrapping and `Effect.runPromise` / `Effect.runPromiseExit` for running.

**Project rule:** use `Effect.tryPromise` when rejection is expected and must enter a typed error channel. Use `Effect.promise` only when rejection is a defect under the interface's contract. Translate external errors immediately into an application-owned tagged error.

```ts
import { Effect, Schema } from "effect"

class MailError extends Schema.TaggedErrorClass<MailError>()("MailError", {
  operation: Schema.String,
  cause: Schema.Defect
}) {}

const send = (message: Message) =>
  Effect.tryPromise({
    try: (signal) => legacyMailer.send(message, { signal }),
    catch: (cause) => new MailError({ operation: "send", cause })
  })
```

**Project rule:** pass cancellation signals to APIs that support them. Wrap resource acquisition/release with scoped Effect patterns rather than `tryPromise` alone.

**Project rule:** call `Effect.runPromise` only at an existing Promise framework edge when failure can reject normally. Use `Effect.runPromiseExit` when the adapter must inspect success, typed failure, defect, or interruption without losing cause information. Do not repeatedly run Effects inside Effect modules; compose and run once at the outer edge.

| Existing edge | Project rule |
|---|---|
| Promise that may reject normally | wrap with `Effect.tryPromise` and map the error |
| Promise documented never to reject | `Effect.promise` is acceptable; rejection is a defect |
| Promise-returning framework handler | compose an Effect, provide its layer, then `runPromise` at that edge |
| Edge requiring total outcome inspection | use `runPromiseExit` and map `Exit` deliberately |
| Callback/resource API | build an adapter with cancellation and scoped finalization; do not only promisify acquisition |

### 2. Where to start

The outline suggests new features, error-prone paths, and API/service seams; it cautions against hot paths, stable code, and tight deadlines.

**Project rule:** new or meaningfully extended product capabilities follow the phased product-module process: classify, model relationships, define shared contract, persistence, service, transport, backend tests, frontend atoms, UI, routes/navigation, observability, and docs. Complete domain/API design before UI unless explicitly UI-only.

**Project rule:** for incremental work, choose a vertical seam with measurable benefit and one runtime edge. Good first candidates centralize external I/O, typed errors, resource lifecycle, retry, concurrency, or test substitution. Do not produce dozens of thin wrapper modules merely to increase Effect usage.

**Project rule:** do not rewrite stable modules without a concrete defect, lifecycle risk, testability need, or architecture violation. For hot paths, benchmark before and after. Under a tight deadline, preserve the existing interface and introduce the smallest adapter seam that leaves later migration possible.

### 3. Wrapping external libraries

The outline proposes a callback-to-Effect service using a tag and layer.

**Project rule:** define an application-owned interface in domain language, translate errors at the adapter, and keep vendor types inside the live adapter. Add a second fake/memory adapter when tests need substitution; do not create a seam for hypothetical swapping alone.

```ts
import { Context, Effect, Layer, Schema } from "effect"

class SearchError extends Schema.TaggedErrorClass<SearchError>()("SearchError", {
  cause: Schema.Defect
}) {}

class SearchIndex extends Context.Service<SearchIndex, {
  query(text: string): Effect.Effect<ReadonlyArray<Result>, SearchError>
}>()("app/SearchIndex") {
  static readonly live = Layer.effect(
    SearchIndex,
    Effect.gen(function*() {
      const client = yield* VendorClient
      return SearchIndex.of({
        query: Effect.fn("SearchIndex.query")(function*(text: string) {
          return yield* client.search(text).pipe(
            Effect.mapError((cause) => new SearchError({ cause }))
          )
        })
      })
    })
  )
}
```

**Project rule:** if the external client needs config to construct a layer, keep it local and use `Layer.unwrap`. If it acquires sockets, workers, files, child processes, or subscriptions, use a scoped layer and test release on success, failure, interruption, and startup failure.

### 4. Framework integration

The draft names Express/Fastify, Next.js API routes, and Server Actions but supplies no rules or examples.

**Project rule:** this template's backend uses the shared Effect HTTP API contract and typed client; do not introduce Express/Fastify or ad-hoc Next.js handlers as a parallel product transport. At any unavoidable Promise framework seam, decode framework input, run a fully provided Effect once, and map `Exit` into the framework's response/error model. Framework adapters do not call repositories or own product behavior.

### 5. Gradual service introduction

The outline suggests starting with plain functions and upgrading when dependency injection, shared state, or composition demands it.

**Project rule:** pure domain transformations can remain plain functions. Introduce an Effect module when the interface must express typed failure, dependencies, resource lifecycle, concurrency, observability, or test adapters. Introduce a `Context.Service`/layer when construction and dependency substitution provide real leverage. Do not wrap every helper in a service.

**Project rule:** migrate callers by preserving one interface seam:

1. characterize existing behavior and failure modes;
2. define the application-owned interface and invariants;
3. implement a legacy adapter behind it;
4. move one vertical caller path to Effect;
5. test the interface and lifecycle;
6. migrate remaining callers;
7. delete the legacy adapter only after no callers remain.

The deletion test prevents pass-through layers from becoming permanent architecture.

### 6. Resources

The draft mentions an Inato migration story and Effect documentation but contains no details or links.

**Project rule:** treat external migration stories as context, not repository authority. Validate adopted patterns against the exact pinned v4 beta source, this repository's `docs/*`, applicable `.agents/skills/*`, and executable architecture checks.

## Lifecycle migration checklist

**Project rule:** every migrated I/O module answers:

- [ ] Who constructs it, and in which layer?
- [ ] Which config is required, optional, or intentionally defaulted?
- [ ] What resources are acquired, and is acquisition scoped?
- [ ] What happens on partial initialization failure?
- [ ] Does interruption reach the underlying Promise/callback/process?
- [ ] Are child fibers scoped or supervised?
- [ ] What is the startup order relative to migrations and readiness?
- [ ] What drains or terminates during shutdown, and under what deadline?
- [ ] Can callers accidentally use a resource after its scope closes?

## Error migration checklist

**Project rule:** preserve the distinction among expected domain error, operational adapter error, defect, and interruption.

- [ ] Shared client-visible errors have explicit schemas and HTTP contracts.
- [ ] Vendor/SQL/process errors become narrow server-side tagged errors with safe context.
- [ ] Repositories do not invent client-visible errors.
- [ ] Services map known outcomes into product errors.
- [ ] Handlers map internal failures to safe public errors.
- [ ] `orDie` is not used for user-manageable or operational failures.
- [ ] Promise rejection is not erased as `unknown` at every caller.
- [ ] Retry policy is based on typed transient failure and idempotency.
- [ ] Logs retain diagnostic causes without exposing them publicly.

## Testing migration checklist

**Project rule:** the interface is the test surface.

- [ ] Characterization tests exist before changing legacy behavior.
- [ ] Pure logic is tested directly without unnecessary layers.
- [ ] Application modules are tested with memory/fake adapters.
- [ ] Resource tests cover acquisition, release, interruption, and startup failure.
- [ ] SQL integration uses temporary PGlite and the real migration runner.
- [ ] Canonical e2e tests use the typed client against a fetchable app.
- [ ] External providers/processes have focused adapter contract tests; live tests are opt-in.
- [ ] Architecture checks reject forbidden dependency direction.
- [ ] Tests assert typed errors and `Exit` semantics where defects/interruption matter.

For meaningful backend/shared changes, run at least:

```bash
pnpm --filter @app/shared check
pnpm --filter @app/server check
pnpm --filter @app/server test
pnpm --filter @app/server build
```

For full-stack changes, prefer `pnpm check`, `pnpm build`, `pnpm lint`, relevant tests, and smoke checks.

## Security migration checklist

**Project rule:** migration must not weaken existing controls.

- [ ] Authentication and tenant/account/workspace scope remain in the service/use-case path.
- [ ] External input is schema-decoded at the transport seam and domain-validated in the service.
- [ ] Required secrets use redacted typed config and are absent from logs/errors.
- [ ] Adapters apply least privilege, bounded input/output, timeout, and concurrency.
- [ ] Retries cannot duplicate consequential writes without idempotency.
- [ ] Child processes avoid shell interpolation; HTTP clients enforce SSRF policy where relevant.
- [ ] Telemetry annotations are safe and low-cardinality.
- [ ] Public contracts never expose internal causes or unstable implementation types.
- [ ] Cross-scope denial and malicious/malformed input have tests.

## Adoption anti-patterns

**Project rule:** avoid:

- a “big bang” rewrite with no preserved seam;
- one global config object and direct `process.env` reads;
- running Effects repeatedly in the middle of the call graph;
- `Effect.tryPromise` wrappers that ignore cancellation and resource release;
- generic `unknown` errors or `orDie` for operational failures;
- service wrappers around pure one-line helpers;
- handlers that call repositories directly;
- repositories containing IDs, normalization, auth, or product errors;
- shared packages depending on app/runtime/provider code;
- adding an interface with only one adapter and no concrete substitution need;
- broad formatting churn mixed with migration behavior;
- claiming draft Effect Solutions pages prescribe project details they do not contain.

## Adoption review checklist

**Project rule:**

- [ ] The migration has a named interface seam and a concrete objective.
- [ ] Dependency direction matches repository architecture.
- [ ] The module is deep enough to provide locality and leverage.
- [ ] Exact beta and unstable API exposure are documented.
- [ ] Config, lifecycle, errors, observability, security, and tests migrate with behavior.
- [ ] Public contracts and runtime adapters remain separate.
- [ ] Legacy and live adapters have a deletion plan.
- [ ] Docs and architecture checks are updated in the same change when behavior changes.
- [ ] The diff is split into coherent, independently reviewable commits.

## Source map

| Topic | Source and maturity |
|---|---|
| Project-structure topic list | [effect.solutions/project-structure](https://www.effect.solutions/project-structure), retrieved 2026-07-10 — **draft/TODO only** |
| Incremental-adoption topic list and named Promise APIs | [effect.solutions/incremental-adoption](https://www.effect.solutions/incremental-adoption), retrieved 2026-07-10 — **proposed outline only** |
| Concrete repository layout, dependency flow, persistence, errors, and module policy | `AGENTS.md` and `docs/architecture.md` — **Project rule** |
| Typed service-local config and startup strictness | `.agents/skills/effect-service-config/SKILL.md` and `references/config-rules.md` — **Project rule** |
| Module depth, seam, adapter, deletion test, locality, leverage | `~/.agents/skills/improve-codebase-architecture/SKILL.md` — **Project rule vocabulary applied here** |
| v4 beta implementation reference | `.repos/effect-smol/` at `3e4abbcb0d0e9a5e82b6b88c7ef7ab69900105ec` |

No folder layout, framework choice, migration sequence, lifecycle policy, error policy, test strategy, or security policy above is presented as completed Effect Solutions guidance. Every such completion is explicitly a **Project rule**.
