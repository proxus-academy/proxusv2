# Testing strategy

This document is the project-specific testing source of truth. Effect-specific
techniques are documented in [`effect/testing.md`](./effect/testing.md).

## Principle

Test each stable interface with the smallest real dependency graph that proves
its behavior. Do not mock the layer under test and do not repeat domain rules at
HTTP or UI level.

```text
Schema and pure graph rules
        ↓
StudyCatalog + in-memory repository
        ↓
Repository contract + PGlite
        ↓
Repository contract + PostgreSQL
        ↓
HttpApi typed client + in-process handlers
        ↓
Effect Atom registry + typed API client
        ↓
Few browser journeys
```

## Suites

### Shared schemas and contracts

Location:

```text
packages/shared/src/**/*.test.ts
```

Cover decoding, branded IDs, graph inference, public error statuses and OpenAPI
shape. Compile-time assertions protect generic relationships. These tests must
not depend on server, React, SQL, or Drizzle.

### Application service

Location:

```text
packages/backend-domain/src/modules/<module>/*.live.test.ts
```

Run the real service against a fresh in-memory implementation of its repository
port. Replace time, randomness and external gateways with deterministic Effect
services. Test orchestration, defaults, generated values, typed failures and
repository delegation through the service interface.

The in-memory repository models domain semantics, not SQL rows. SQL constraints,
locking and rollback belong to persistent adapter tests.

### Repository contract

Location:

```text
packages/backend-infra/src/modules/<module>/test/repository-contract.ts
packages/backend-infra/src/modules/<module>/*.test.ts
```

One reusable contract must eventually run against:

1. fresh PGlite on every pull request;
2. a pinned production-compatible PostgreSQL in CI.

Contract cases are independent tests for create/read/update (including every
node status), missing records, uniqueness, endpoint invariants, ordering and
error preservation.
Adapter-specific corruption and constraint tests remain beside the adapter.

PGlite is the fast PostgreSQL-compatible integration engine, not proof of
production concurrency or driver parity.

### Agent store and worker coordination

El contrato reutilizable de `AgentStore` corre contra memory y PGlite en el gate determinista, y contra PostgreSQL cuando `AGENT_STORE_POSTGRES_URL` está configurado. Cubre cursor global, claims contendidos, heartbeat, expiración, fencing y recuperación de huérfanos. PGlite valida la migración canónica y semántica PostgreSQL compatible; no se usa como prueba de `SKIP LOCKED` o concurrencia entre procesos. El worker se prueba con clock/store deterministas y finalización scoped; el smoke PostgreSQL real es opt-in.

### Agent harness executable

`apps/agent-cli` composes persistent PGlite using the canonical PostgreSQL migrations, an in-memory deterministic skill, a scripted
model, console/JSON reporting, and either a scoped temporary sandbox (local) or
the explicitly selected current workspace (CI). Its vertical fixture proves
issue inspection, same-workspace delegated analysis, a prepared file change,
validation, PGlite reopen, and scoped cleanup without a provider or GitHub
credential. This fixture is a composition test, not the production engineering
DSL or a live integration test.

```bash
pnpm --filter @proxus/agent-cli test
pnpm --filter @proxus/agent-cli start -- --json --database .proxus/agent-runs
# trusted disposable CI checkout only:
pnpm --filter @proxus/agent-cli start -- --json --workspace "$PWD"
```

### Google Chat agent

`apps/google-chat-agent` se prueba sin Google ni GitHub live. Fixtures firmadas y fakes deterministas cubren binding `tenant + space + thread`, restart desde snapshot durable, delivery duplicada, cola en turn boundaries, progreso hijo por cursor, card/resolución de approval autenticada e idempotencia del post final.

```bash
pnpm --filter @proxus/google-chat-agent test
```

### GitHub App adapters

Los adapters reader/writer se prueban contra `GitHubHttpClient` y `GitHubPushBroker` falsos host-side, sin red ni secretos reales. El contrato determinista cubre separación de repositorio/permisos, refresh de installation token, redacción, mapping seguro de errores, conflictos de SHA, invalidación de approval y deduplicación de PR/comentario mediante evidencia aprobada. Los smokes live son opt-in y nunca forman parte del gate normal.

### Migrations and seeds

Location:

```text
packages/backend-infra/src/database/*.test.ts
```

Cover migration from an empty database, pending-migration detection, deterministic
and idempotent seeds, canonical reconciliation and destructive PGlite reset.
Production migrations are applied manually; startup must fail while any are
pending.

### HTTP

Handler tests in `backend-transport` and `backend-admin-transport` build the
narrow `HttpApi` root with `StudyCatalog` replaced at its service interface.
They verify only transport adaptation: decoding, service arguments, status
codes, safe error mapping and authentication context. Composition-root tests
also assert that crossed routes return 404 and are absent from OpenAPI.

A small in-process e2e suite uses the generated typed client against the real
web handler without opening TCP:

```text
typed client → HttpApi handlers → StudyCatalogLive → PGlite
```

Malformed transport input is a 400 decoding failure. Expected domain errors keep
the statuses declared in the shared contract. Repository failures become a safe
bodyless 500 and never expose causes.

### React and Effect Atom

Atoms are tested through a fresh `AtomRegistry` and test API Layer per test.
Cover loading/success/error transitions, family isolation, cancellation,
mutation invalidation and retries with virtual time. Platform-dependent atoms
receive memory atoms or test Layers at the port boundary; tests do not mock
browser globals, React Native modules or vendor SDKs. Live adapters have focused
contract, serialization and lifecycle tests. Components test accessible
rendering and dispatch; they do not duplicate atom or service behavior.

Browser tests are reserved for navigation, focus, drag-and-drop, uploads and a
few critical public/admin journeys.

## Isolation

- No test uses development or production data.
- Mutable Layers are fresh per test unless reset is explicit.
- PGlite databases are in-memory or use test-owned temporary directories.
- PostgreSQL suites use a database/schema isolated per worker.
- Seeds are used only in seed tests and selected e2e journeys, never globally.
- Builders return valid deterministic domain values; fixtures perform Effectful
  arrangement through public interfaces.

## CI stages

1. **Static:** frozen install, Effect diagnostics, typecheck and architecture
   boundaries.
2. **Fast:** shared schemas/contracts, services and frontend atom/component tests.
3. **PGlite:** migrations, seeds, repository contracts and in-process HTTP e2e.
4. **PostgreSQL:** migrations, repository contract, transaction/concurrency and
   production composition smoke tests.
5. **Build/browser smoke:** workspace build and the minimal browser journeys.

The PostgreSQL stage is required before merge once CI infrastructure exists.
Nightly jobs may add repeated race tests and additional PostgreSQL versions.

## Current commands

```bash
pnpm effect:diagnostics
pnpm --filter @proxus/shared test
pnpm --filter @proxus/backend-domain test
pnpm --filter @proxus/backend-infra test
pnpm --filter @proxus/backend-transport test
pnpm --filter @proxus/backend-admin-transport test
pnpm --filter @proxus/server test
pnpm --filter @proxus/admin-server test
pnpm --filter @proxus/backend-infra db:check
pnpm typecheck
pnpm test
pnpm build
```

The workspace currently uses normal Vitest. Adopt `@effect/vitest` when the
concurrent design-system dependency work is stable; then use `it.effect` and
`TestClock` for scoped resources and virtual time without changing the suite
boundaries above.
