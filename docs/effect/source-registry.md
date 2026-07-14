# Effect handbook source registry

Last reviewed: **2026-07-10**.

This registry proves the handbook's source coverage and prevents unversioned web guidance from silently becoming project policy.

## Version pins

| Source | Pin/status | Use |
| --- | --- | --- |
| Application packages | `effect@4.0.0-beta.58` and aligned `@effect/*` packages | Compile-time authority |
| Local reference | `effect-smol` commit `b559d68845f848a10153395778f035682d399075`; package `4.0.0-beta.66` | Upstream design/source reference; signatures require backport verification |
| Effect Solutions | Retrieved 2026-07-10; web content is not commit-pinned here | Secondary prescriptive guidance |

`effect-smol/ai-docs/src` and source under `effect-smol/packages` are authoritative only for that snapshot. They must not override installed package types or project architecture.

## Effect Solutions inventory

All 15 accessible documents are mapped below. “Published” means listed by the production index. “Draft” means accessible directly but filtered from the public index on the review date.

| Document | Publication | Handbook destination | Notes |
| --- | --- | --- | --- |
| [Quick Start](https://www.effect.solutions/quick-start) | Published | [`setup-and-typescript.md`](./setup-and-typescript.md) | Setup workflow and local references |
| [Project Setup](https://www.effect.solutions/project-setup) | Published | [`setup-and-typescript.md`](./setup-and-typescript.md) | Language Service/editor setup |
| [TypeScript Configuration](https://www.effect.solutions/tsconfig) | Published | [`setup-and-typescript.md`](./setup-and-typescript.md) | Strictness and module mode |
| [Basics](https://www.effect.solutions/basics) | Published | [`effect-programs.md`](./effect-programs.md) | `Effect.gen`, `Effect.fn`, pipe, retry/timeout |
| [Services & Layers](https://www.effect.solutions/services-and-layers) | Published | [`services-layers-and-config.md`](./services-layers-and-config.md) | Service-first design and Layer composition |
| [Data Modeling](https://www.effect.solutions/data-modeling) | Published | [`schema-and-errors.md`](./schema-and-errors.md) | Schema classes, variants, brands, codecs |
| [Error Handling](https://www.effect.solutions/error-handling) | Published | [`schema-and-errors.md`](./schema-and-errors.md) | Tagged errors, recovery, defects |
| [Config](https://www.effect.solutions/config) | Published | [`services-layers-and-config.md`](./services-layers-and-config.md) | Config, providers, Schema, redaction |
| [Testing](https://www.effect.solutions/testing) | Published | [`testing.md`](./testing.md) | `@effect/vitest`, test services and Layers |
| [Command-Line Interfaces](https://www.effect.solutions/cli) | Published | [`cli-and-child-processes.md`](./cli-and-child-processes.md) | Typed CLI; examples require beta verification |
| [Project Structure](https://www.effect.solutions/project-structure) | **Draft/TODO** | [`adoption-and-project-structure.md`](./adoption-and-project-structure.md) | Topic list only; completions are Project rules |
| [Incremental Adoption](https://www.effect.solutions/incremental-adoption) | **Draft/outline** | [`adoption-and-project-structure.md`](./adoption-and-project-structure.md) | Outline only; no implied upstream prescription |
| [HTTP Clients](https://www.effect.solutions/http-clients) | **Draft** | [`http-clients.md`](./http-clients.md) | Substantial but unpublished; status/error caveats retained |
| [Observability & OpenTelemetry](https://www.effect.solutions/observability) | **Draft** | [`observability.md`](./observability.md) | Supplemented with project privacy/cardinality rules |
| [Service `use` pattern](https://www.effect.solutions/use-pattern) | **Draft** | [`effect-programs.md`](./effect-programs.md), [`services-layers-and-config.md`](./services-layers-and-config.md) | Foreign Promise clients and cancellation |

Known source caveats at review time:

- Draft pages were excluded from the public document index but remained directly accessible.
- Effect Solutions is prescriptive, opinionated guidance, not the official exhaustive Effect reference.
- Examples target Effect v4/beta and may drift between beta releases.
- Project structure, SQL architecture, auth/scope, full HTTP e2e, telemetry privacy, and migration governance are completed by explicitly labeled Project rules, not attributed to incomplete upstream pages.

## `effect-smol/ai-docs` inventory

Root source: [`.repos/effect-smol/ai-docs/src`](../../.repos/effect-smol/ai-docs/src). `LLMS.md` is generated from these sources and is not an independent authority.

| Source path | Covered topics | Handbook destination |
| --- | --- | --- |
| `src/index.md` | Root orientation | [`README.md`](./README.md) |
| `01_effect/01_basics/index.md`, `01_effect-gen.ts`, `02_effect-fn.ts`, `10_creating-effects.ts` | Effect creation, sequencing, named operations | [`effect-programs.md`](./effect-programs.md) |
| `01_effect/02_services/index.md`, `01_service.ts`, `10_reference.ts`, `20_layer-composition.ts`, `20_layer-unwrap.ts` | Services, references, Layers, dynamic Layers | [`services-layers-and-config.md`](./services-layers-and-config.md) |
| `01_effect/03_errors/index.md`, `01_error-handling.ts`, `10_catch-tags.ts`, `20_reason-errors.ts` | Tagged errors, tag/reason recovery | [`schema-and-errors.md`](./schema-and-errors.md) |
| `01_effect/04_resources/index.md`, `10_acquire-release.ts`, `20_layer-side-effects.ts`, `30_layer-map.ts` | Scope, acquisition/release, background Layers, keyed resources | [`resources-runtime-and-integration.md`](./resources-runtime-and-integration.md) |
| `01_effect/05_running/index.md`, `10_run-main.ts`, `20_layer-launch.ts` | Runtime entrypoints and long-running apps | [`resources-runtime-and-integration.md`](./resources-runtime-and-integration.md) |
| `01_effect/06_pubsub/index.md`, `10_pubsub.ts` | In-process broadcast/event bus | [`streams-pubsub-and-dataflow.md`](./streams-pubsub-and-dataflow.md) |
| `02_stream/index.md`, `10_creating-streams.ts`, `20_consuming-streams.ts`, `30_encoding.ts` | Stream sources, transforms, sinks, NDJSON/Msgpack | [`streams-pubsub-and-dataflow.md`](./streams-pubsub-and-dataflow.md) |
| `03_integration/index.md`, `10_managed-runtime.ts` | Bridging non-Effect frameworks | [`resources-runtime-and-integration.md`](./resources-runtime-and-integration.md) |
| `05_batching/index.md`, `10_request-resolver.ts` | Requests and batch resolvers | [`concurrency-scheduling-and-batching.md`](./concurrency-scheduling-and-batching.md) |
| `06_schedule/index.md`, `10_schedules.ts` | Retry, repeat, polling schedules | [`concurrency-scheduling-and-batching.md`](./concurrency-scheduling-and-batching.md) |
| `08_observability/index.md`, `10_logging.ts`, `20_otlp-tracing.ts` | Structured logging and OTLP | [`observability.md`](./observability.md) |
| `09_testing/index.md`, `10_effect-tests.ts`, `20_layer-tests.ts` | Effect Vitest and service Layers | [`testing.md`](./testing.md) |
| `50_http-client/index.md`, `10_basics.ts` | Low-level external HTTP client | [`http-clients.md`](./http-clients.md) |
| `51_http-server/index.md`, `10_basics.ts` | Schema-first HttpApi walkthrough | [`http-api-server-and-middleware.md`](./http-api-server-and-middleware.md) |
| `51_http-server/fixtures/api/{Api,Authorization,System,Users}.ts` | Root/group APIs and middleware contract | [`http-api-server-and-middleware.md`](./http-api-server-and-middleware.md) |
| `51_http-server/fixtures/domain/{User,UserErrors}.ts` | Domain schemas and public errors | [`schema-and-errors.md`](./schema-and-errors.md), [`http-api-server-and-middleware.md`](./http-api-server-and-middleware.md) |
| `51_http-server/fixtures/server/Authorization.ts`, `Users.ts`, `Users/http.ts` | Middleware implementation, service, handlers | [`http-api-server-and-middleware.md`](./http-api-server-and-middleware.md) |
| `60_child-process/index.md`, `10_working-with-child-processes.ts` | Child processes, pipelines, streamed output | [`cli-and-child-processes.md`](./cli-and-child-processes.md) |
| `70_cli/index.md`, `10_basics.ts` | Arguments, flags, commands and runtime | [`cli-and-child-processes.md`](./cli-and-child-processes.md) |
| `71_ai/index.md`, `10_language-model.ts`, `20_tools.ts`, `30_chat.ts` | Generation, structured output, streaming, tools, chat | [`ai.md`](./ai.md) |
| `71_ai/fixtures/domain/LaunchPlan.ts` | Schema-validated AI output | [`ai.md`](./ai.md), [`schema-and-errors.md`](./schema-and-errors.md) |
| `80_cluster/index.md`, `10_entities.ts` | Entity RPC and test runner | [`cluster.md`](./cluster.md) |

## Project-only extensions

The upstream inventories do not fully specify this template's SQL, contract evolution, SaaS access, or webapp architecture. The following remain project-owned:

| Area | Authority |
| --- | --- |
| Handler/service/repository/adapter flow | [`../architecture.md`](../architecture.md) and `AGENTS.md` |
| Effect SQL repositories and migrations | [`../database.md`](../database.md) and `effect-sql-repository-architecture` skill |
| Shared API evolution | [`../api.md`](../api.md) and `api-contract-evolution` skill |
| Auth, membership, scope and cross-scope isolation | `saas-auth-scope-architecture` skill |
| Temporary SQL and typed-client e2e | [`../testing.md`](../testing.md) and `effect-layered-testing` skill |
| Safe telemetry and local operations | [`../observability.md`](../observability.md) and `effect-observability-patterns` skill |
| React atoms and UI architecture | [`../webapp-architecture.md`](../webapp-architecture.md) and webapp skills |

## Upgrade procedure

When upgrading Effect or the reference snapshot:

1. Record old and new application versions and reference commits.
2. Diff every used `effect/unstable/*` module and provider package.
3. Type-check every handbook example that is intended to be executable, or explicitly label it conceptual.
4. Review error, cancellation, Scope, Layer memoization, HTTP codec, retry, and runtime semantics.
5. Run all checks, builds, server tests, and relevant smoke tests.
6. Update the version warnings, mappings, and retrieval date in this registry.
7. Keep the upgrade separate from unrelated feature work.
