# Proxus conventions for Effect

This document contains project-owned rules. The numbered upstream port explains Effect itself; these rules decide how Proxus applies it.

## Authority

Use this order when sources disagree:

1. `AGENTS.md` and accepted project architecture decisions.
2. Installed package types, project code, executable checks, and tests.
3. Project documents under `docs/`.
4. The pinned upstream source recorded in [`SOURCE.md`](./SOURCE.md).

Proxus currently installs `effect@4.0.0-beta.98`. Upstream examples were ported from `4.0.0-beta.101`, so imports and signatures must be checked before use. Localize `effect/unstable/*` behind application-owned modules and revalidate it on upgrades.

## Required backend flow

```text
HTTP handler → service/use case → repository port → adapter
```

Handlers adapt transport. Services own product behavior. Repository ports describe persistence needs without Drizzle or PostgreSQL. Adapters own infrastructure details. Composition roots provide the complete Layer graph.

See [`../architecture/domain-driven-architecture.md`](../architecture/domain-driven-architecture.md) and [`../api.md`](../api.md).

## Schemas and errors

- Model process, persistence, configuration, and external inputs with `Schema`.
- Do not duplicate wire types manually.
- Keep expected recoverable failures in the typed error channel.
- Reserve defects for bugs and broken invariants.
- Never expose infrastructure errors directly through public contracts.

## Services and Layers

- Define capabilities with small domain-meaningful Effect services.
- Resolve dependencies while constructing Layers.
- Compose and provide Layers at application composition roots.
- Do not construct Layers or run Effects from React render paths.
- Introduce a port only when a real adapter varies or the domain requires the seam.

## Resources and concurrency

- Own resources with `Scope` and propagate interruption to foreign APIs where possible.
- Bound concurrency, retries, queues, buffering, pools, subprocess output, and long-running work.
- Define timeout, retry, cancellation, and shutdown semantics before implementing remote work.

## HTTP

Public and administrative contracts live in `packages/shared`. Generated typed clients consume those contracts. Frontend and backend modules do not use ad-hoc `fetch` for first-party operations.

See [`50_http_client.md`](./50_http_client.md), [`51_http_server.md`](./51_http_server.md), and [`../api.md`](../api.md).

## React and Effect Atom

React renders state and dispatches events. Effect Atom owns application state, remote state, mutations, resource lifecycles, and forms. The required flow is:

```text
view → atom → application client or platform port → adapter
```

See [`90_react_and_effect_atom.md`](./90_react_and_effect_atom.md), [`../webapp-architecture.md`](../webapp-architecture.md), and [`../forms/README.md`](../forms/README.md).

## Observability and privacy

Use stable span names and safe, low-cardinality attributes. Never record passwords, tokens, authorization headers, raw user payloads, verification codes, or secrets. Meaningful remote and use-case work should expose enough structured context to diagnose failures without leaking sensitive data.

## Testing

Test the smallest stable interface with the smallest real dependency graph that proves its behavior. Replace dependencies through Layers or ports, not by mocking the module under test. Use temporary migrated SQL for repository adapters and typed clients for complete HTTP contract tests.

See [`09_testing.md`](./09_testing.md) and [`../testing.md`](../testing.md).

## Review workflow

Before adopting a new Effect capability:

1. Read only the applicable numbered chapter.
2. Verify imports against the installed version.
3. Identify service, port, adapter, Layer, resource, and error ownership.
4. Decide cancellation, timeout, retry, concurrency, and shutdown semantics.
5. Decide tests and safe observability.
6. Run the validation required by `AGENTS.md`.
7. Update this document only when a reusable Proxus rule changes.
