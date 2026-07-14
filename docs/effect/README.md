# Effect implementation handbook

This handbook is the normative implementation guide for Effect code in this template. It covers the 15 Effect Solutions pages accessible when reviewed—10 listed in the public index and five direct draft pages—and every topic under the pinned [`effect-smol/ai-docs`](../../.repos/effect-smol/ai-docs/) snapshot.

It complements rather than replaces the project-specific documents in `docs/`:

- [`../architecture.md`](../architecture.md): module boundaries and request flow.
- [`../api.md`](../api.md): the concrete shared HTTP contract.
- [`../database.md`](../database.md): the concrete persistence and migration workflow.
- [`../testing.md`](../testing.md): repository commands and current test harnesses.
- [`../observability.md`](../observability.md): the current local telemetry stack.

## Version and authority

The application pins `effect@4.0.0-beta.58`. The local upstream reference is `effect-smol` commit `b559d68845f848a10153395778f035682d399075`, whose package version is `4.0.0-beta.66`. The snapshot is therefore a design reference, not proof that an API is available unchanged in the installed beta.

When sources disagree, use this order:

1. `AGENTS.md`, accepted project decisions, and applicable local skills.
2. Installed package types, project code, executable checks, and tests.
3. Project documents under `docs/`.
4. The pinned `effect-smol` source and `ai-docs` snapshot.
5. Published Effect Solutions pages.
6. Effect Solutions draft pages, only as explicitly marked supporting material.

Before adopting an example, verify its imports and signatures against the installed version. APIs under `effect/unstable/*` are not stable public boundaries and must be localized behind application-owned services or adapters.

## Policy labels

- **Required / Project rule**: mandatory in this template.
- **Recommended**: default unless a documented constraint justifies another design.
- **Available**: valid specialized capability; do not introduce speculatively.
- **Legacy**: transitional behavior that new work must not extend.
- **Draft source**: accessible upstream material that is unpublished or incomplete; never treated as authority by itself.

## Core reading path

1. [Setup and TypeScript](./setup-and-typescript.md)
2. [Effect programs](./effect-programs.md)
3. [Services, Layers, and configuration](./services-layers-and-config.md)
4. [Schema and errors](./schema-and-errors.md)
5. [Resources, runtime, and integration](./resources-runtime-and-integration.md)
6. [HTTP API servers and middleware](./http-api-server-and-middleware.md)
7. [HTTP clients](./http-clients.md)
8. [React and Effect Atom](./react-and-effect-atom.md)
9. [Testing](./testing.md)
10. [Observability](./observability.md)

## Guide map

| Area | Guide | Adoption in this template |
| --- | --- | --- |
| Setup, strict TypeScript, Language Service | [Setup and TypeScript](./setup-and-typescript.md) | Adopted and enforced |
| Effect construction, `gen`, `fn`, Promise/callback adapters | [Effect programs](./effect-programs.md) | Required |
| Services, references, Layers, config providers | [Services, Layers, and configuration](./services-layers-and-config.md) | Required |
| Schema, brands, tagged errors, defects | [Schema and errors](./schema-and-errors.md) | Required |
| Scope, finalizers, entrypoints, `ManagedRuntime`, `LayerMap` | [Resources, runtime, and integration](./resources-runtime-and-integration.md) | Scope/runtime required; advanced facilities available |
| Fibers, concurrency, semaphores, retries, schedules, batching | [Concurrency, scheduling, and batching](./concurrency-scheduling-and-batching.md) | Available under the documented constraints |
| Stream, encoding, PubSub, backpressure | [Streams, PubSub, and dataflow](./streams-pubsub-and-dataflow.md) | Available |
| Schema-first server, handlers, middleware, auth/scope | [HTTP API servers and middleware](./http-api-server-and-middleware.md) | Required |
| Low-level and generated HTTP clients | [HTTP clients](./http-clients.md) | Required for remote integrations and first-party clients |
| React state and effects through Effect Atom | [React and Effect Atom](./react-and-effect-atom.md) | Required for web and admin |
| Effect-aware, layered, SQL, and HTTP tests | [Testing](./testing.md) | Required |
| Logging, tracing, OTLP, privacy, cardinality | [Observability](./observability.md) | Required for meaningful remote/use-case work |
| Typed CLI and child processes | [CLI and child processes](./cli-and-child-processes.md) | Available |
| Language models, tools, chat, provider isolation | [AI](./ai.md) | Available; unstable |
| Distributed entities and RPC | [Cluster](./cluster.md) | Available; unstable and high-risk |
| Incremental migration and file placement | [Adoption and project structure](./adoption-and-project-structure.md) | Project rules plus clearly marked draft topics |

## Cross-cutting invariants

Every implementation must preserve these rules:

1. Model external and persisted boundaries with `Schema`; do not duplicate wire types manually.
2. Keep the backend flow `HTTP handler -> service/use case -> repository interface -> adapter`.
3. Define capabilities as small, meaningful services; resolve dependencies while constructing Layers.
4. Compose and provide the graph at a composition root, not throughout business logic.
5. Keep config typed, service-local, redacted where secret, and validated at Layer startup.
6. Keep expected recoverable failures in a typed error channel; reserve defects for bugs and broken invariants.
7. Own resources with `Scope` and propagate interruption to foreign APIs whenever possible.
8. Bound concurrency, retries, buffering, resource pools, subprocess output, and AI/cluster work.
9. Authenticate and validate scope before access; enforce product authorization in services and scope repository queries explicitly.
10. Use stable span names and safe, low-cardinality annotations; never record secrets or raw user payloads.
11. Test the smallest meaningful layer and use temporary migrated SQL plus a typed client for canonical API e2e tests.
12. Localize every beta or `unstable` API behind an application-owned seam and revalidate it on upgrades.

## Source coverage

[`source-registry.md`](./source-registry.md) records the complete source inventory, publication status, handbook destination, pinned versions, and known caveats. Update it whenever the upstream snapshot or Effect version changes.

## Review workflow

For any new Effect capability:

1. Classify the capability and select the relevant guide above.
2. Identify contract, service, adapter, Layer, resource, error, and configuration ownership.
3. Decide cancellation, timeout, retry, concurrency, and shutdown semantics before implementation.
4. Decide the minimum unit, integration, and e2e evidence.
5. Decide safe tracing/logging before adding remote or long-running work.
6. Verify all imported APIs against `4.0.0-beta.58`.
7. Run the validation commands required by `AGENTS.md`.
8. Update project docs and this handbook when a reusable rule changes.
