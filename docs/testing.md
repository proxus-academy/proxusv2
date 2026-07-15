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
apps/server/src/modules/<module>/*.live.test.ts
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
apps/server/src/modules/<module>/test/repository-contract.ts
apps/server/src/modules/<module>/adapters/*.test.ts
```

One reusable contract must eventually run against:

1. fresh PGlite on every pull request;
2. a pinned production-compatible PostgreSQL in CI.

Contract cases are independent tests for create/read/update/archive, missing
records, uniqueness, endpoint invariants, ordering and error preservation.
Adapter-specific corruption and constraint tests remain beside the adapter.

PGlite is the fast PostgreSQL-compatible integration engine, not proof of
production concurrency or driver parity.

### Migrations and seeds

Location:

```text
apps/server/src/infrastructure/database/*.test.ts
```

Cover migration from an empty database, pending-migration detection, deterministic
and idempotent seeds, canonical reconciliation and destructive PGlite reset.
Production migrations are applied manually; startup must fail while any are
pending.

### HTTP

Handler tests build the real `HttpApi` group with `StudyCatalog` replaced at its
service interface. They verify only transport adaptation: decoding, service
arguments, status codes, safe error mapping and authentication context.

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
mutation invalidation and retries with virtual time. Components test accessible
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
pnpm --filter @proxus/server test
pnpm --filter @proxus/server db:check
pnpm check
```

The workspace currently uses normal Vitest. Adopt `@effect/vitest` when the
concurrent design-system dependency work is stable; then use `it.effect` and
`TestClock` for scoped resources and virtual time without changing the suite
boundaries above.
