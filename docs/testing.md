# Testing strategy

This document is the project-specific testing source of truth. Effect-specific
techniques are documented in [`effect/09_testing.md`](./effect/09_testing.md).

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
error preservation. Ordered Study Catalog edge mutations additionally exercise
concurrent create/move/remove on PGlite. The explicit real-PostgreSQL smoke suite
proves the production driver, global source(s)-before-edge locking, deterministic
concurrent append positions `[0, 1]`, concurrent update/remove completion and a
fresh-key retry when an edge source changes while a writer waits; it does not yet
replace running the complete reusable repository contract against PostgreSQL.
Adapter-specific corruption and constraint tests remain beside the adapter.

PGlite is the fast PostgreSQL-compatible integration engine, not proof of
production concurrency or driver parity. PostgreSQL 17 is the definitive gate
for the lock behavior covered by the explicit smoke suite.

### Migrations and seeds

Location:

```text
packages/backend-infra/src/database/*.test.ts
```

Cover migration from an empty database and populated upgrades, pending-migration
detection, deterministic and idempotent seeds, canonical reconciliation and
destructive PGlite reset. The Feature Flags rev0 upgrade fixture applies the
historical migration prefix, inserts legacy object rows plus an already-normalized
array row, then runs the real remaining migrator and verifies revision relocation,
object-to-array normalization, an unchanged array, successful repository/reader
access, the restored immutable trigger and the stricter constraint.
Production migrations are applied manually; startup must fail while any are
pending.

### Identity, onboarding y access-control

Domain prueba normalización, path de onboarding, estados/proveedor derivado, auto-link solo de email verificado y policies RBAC con clocks/randomness deterministas. Infra ejecuta el mismo contrato de users/challenges/sessions contra memory y PGlite: unicidad, hashes, propósito/TTL/intentos/uso único, consumo/rotación atómicos y revocación global. Las pruebas de composición cubren email/Google fake, cookie opaca y la matriz admin anónimo/student/editor/admin.

Los adapters consola/fake solo pertenecen a desarrollo/test. Desarrollo local y las previews desechables generan deliberadamente el código `424242` para verificación de email y recuperación de contraseña; producción conserva el generador criptográfico y tiene un gate que rechaza adapters de entrega no reales. Esto no prueba proveedores reales, que siguen pendientes. Los tests y listados QA nunca imprimen passwords, hashes, tokens ni códigos persistidos.

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

The Admin server additionally runs a production-shaped authorization matrix
through its embedded web handler, real opaque sessions, persisted users and role
assignments, and PGlite. It proves anonymous `401`, authenticated student `403`,
allowed catalog-editor/admin mutations, exact effective capabilities, and that
role management is forbidden to student/editor but allowed to admin. The suite
serializes its files because file-backed PGlite cannot safely be opened by
parallel workers.

Malformed transport input is a 400 decoding failure. The public and admin
composition-root suites also prove that their 256 KiB raw-body middleware runs
before decoding: a normal mutation/analytics body succeeds and an oversized one
returns a bodyless 413. Expected domain errors keep the statuses declared in the
shared contract. Repository failures become a safe bodyless 500 and never expose
causes.

### React and Effect Atom

Atoms are tested through a fresh `AtomRegistry` and test API Layer per test.
Cover loading/success/error transitions, family isolation, cancellation,
mutation invalidation and retries with virtual time. Platform-dependent atoms
receive memory atoms or test Layers at the port boundary; tests do not mock
browser globals, React Native modules or vendor SDKs. Live adapters have focused
contract, serialization and lifecycle tests. Components test accessible
rendering and dispatch; they do not duplicate atom or service behavior.

Browser tests are reserved for navigation, focus, drag-and-drop, uploads and a
few critical public/admin journeys. `apps/web` ejecuta
Vitest real con render estático de sus vistas públicas, estados remotos y copy
accesible localizado; el test de stories web comprueba además que importar la
story pura no modifica History. El build de Storybook con addon a11y sigue
siendo una comprobación estática, no un runner de navegador/a11y. Ningún paquete
de frontend declara un `test` que salga con éxito mediante `--passWithNoTests` o
un proceso vacío.

## Isolation

- No test uses development or production data.
- Mutable Layers are fresh per test unless reset is explicit.
- PGlite databases are in-memory or use test-owned temporary directories.
- `@proxus/backend-infra` serializes normal Vitest files in one worker because
  concurrent PGlite/Wasm initialization caused resource contention; each test
  still owns a fresh database and no timeout increase is used as the isolation
  mechanism.
- The explicit PostgreSQL suite is also serial. CI gives it a fresh dedicated
  database in a fresh service container; the suite migrates idempotently and
  truncates every product table before and after each case. The populated-upgrade
  case rebuilds the migration-owned schema and ledger from the historical prefix,
  then leaves it fully migrated for subsequent cases. A local `DATABASE_URL` must
  identify an equally disposable, test-owned database.
- Seeds are used only in seed tests and selected e2e journeys, never globally.
- Builders return valid deterministic domain values; fixtures perform Effectful
  arrangement through public interfaces.

## Current CI gates and pending suites

The current `.github/workflows/validate.yml` exposes every authoritative gate independently and starts them in parallel: validator self-test, Effect diagnostics, typecheck, type-aware lint, anti-slop rule regressions, React Doctor, dependency-cruiser architecture, Knip, workspace contracts, Vitest/PGlite, build and PostgreSQL 17. There is no duplicate monolithic CI job and no validator uses `continue-on-error`. A failure or warning in any strict validator remains a failed check.

The root `pnpm validate:pr` command retains the same complete sequential validation for local use: validator self-tests, static validation, vendored anti-slop rule regressions, normal Vitest/PGlite suites and every workspace build including Storybook. CI changes scheduling, not coverage. Knip generates Paraglide before analysis because its fresh runner must resolve those generated imports without relying on another job's filesystem.

Turborepo schedules `build`, `typecheck` and `test` from the dependencies declared
in workspace manifests and caches deterministic task results locally. Builds run
dependency builds first and cache declared `dist` and `storybook-static` outputs;
typechecks and tests cache successful logs because they do not produce committed
artifacts. CI intentionally keeps normal tests at concurrency one for the PGlite
resource constraints described above. Global validators (`lint`, `boundaries`,
`knip`, workspace contracts and validator self-tests) remain explicit root tasks
and are not treated as package-local affected checks. No Turbo Remote Cache is configured. CI jobs persist the pnpm store and use distinct GitHub Actions cache namespaces for the `typecheck`, `tests` and `build` `.turbo` directories so concurrent jobs cannot save different partial caches under one key. The validator self-test remains unconditional to preserve strict verification of the validation harness.

`postgres` provisions `postgres:17.7-bookworm` with a `pg_isready` healthcheck
and a fresh `proxus_postgres_test` database. It explicitly runs the production
migration command and then:

```bash
DATABASE_URL=postgresql://... \
pnpm --filter @proxus/backend-infra test:postgres
```

`test:postgres` fails before Vitest starts when `DATABASE_URL` is absent; there
is no skip inside the suite. It covers real migration execution and a successful
no-pending-migrations check, the populated Feature Flags rev0/object upgrade read
through repository and HTTP-facing reader ports, Feature Flags publish/read of
revision 1, Study Catalog create/read, two concurrent edge appends, concurrent
update/remove and a source-change retry. A Deferred-held source-row lock and PostgreSQL lock-state
observation form each concurrency barrier; the tests use no sleeps, assert that
writers are blocked on sources before release, and verify the final contiguous
edge order.
Normal local `test`, `static` and `validate:pr` do not invoke this suite and do
not require Docker or PostgreSQL.

CI still does **not** invoke a real browser runner. Real-browser journeys and the
complete repository contract against PostgreSQL remain pending; neither is
implied by the minimal PostgreSQL smoke gate. DOM/component tests and a
Storybook build do not count as browser journeys. Nightly jobs may later add
repeated race tests and additional PostgreSQL versions.

## Deterministic static validation

The checks have no generated allowlist or accepted-violation baseline:

- `effect:diagnostics` obtains the workspace inventory from `pnpm list -r`, sorts
  every discovered `tsconfig.json`, and checks all 15 projects. The wrapper also
  accepts `--root` and a JSON `--inventory` for isolated probes. It passes the
  root Effect Language Service configuration explicitly, so a leaf `plugins`
  override cannot silently reduce coverage. Workspace tsconfigs include their
  Vite, Drizzle and Storybook TypeScript configuration files.
- `lint` is type-aware for TypeScript and deliberately has no formatting rules.
  Its workspace globs include application JavaScript/ESM, TypeScript source,
  Storybook and root `*.config.ts` files while excluding generated trees. It enforces unsafe Promise use (`await-thenable`,
  `no-floating-promises`, `no-misused-promises`), explicit `any`, dangerous assertions
  (`no-non-null-assertion`, `no-unsafe-type-assertion`), and rejects direct
  imports of Node filesystem, path, child-process and HTTP APIs that have
  Effect-native counterparts. Narrow platform composition roots and test-owned
  temporary-directory harnesses must document any inline exception. The same
  gate then runs the vendored anti-slop rules selected in
  `oxlint.anti-slop.config.ts`: they preserve inferred evidence, reject module
  mocking and reflective access, reject explicit `unknown` parameters/returns,
  unsafe dictionaries and React state erased to `any` or `unknown`, use
  domain-owned contract names, and require a
  `SAFETY:` invariant for every necessary non-const assertion. Rules that would
  reject exact optional-property spreads or composition-root Layer assembly
  remain explicitly disabled in that config. An unavoidable external parsing
  seam must carry a local `ANTI-SLOP-BOUNDARY:` justification; the rules test
  this marker while normal Oxlint continues to reject unused disable directives.
  `test:anti-slop` exercises the vendored rule regressions with Node's native
  test runner and TypeScript stripping; `validate:pr` runs it independently of
  lint so a broken rule implementation cannot pass merely because the current
  workspace happens not to trigger it.
- `react:doctor` scans the React surfaces in Web, Admin and Storybook with
  warnings treated as blocking findings. Supply-chain checks remain outside
  this repository gate; narrow project overrides document framework-owned
  exports and development dependencies that the analyzer cannot infer.
- `boundaries` ignores generated `dist`, `coverage` and `storybook-static`
  trees and enforces the documented DDD direction: shared is runtime-neutral;
  Domain cannot reach adapters/transports/apps; Infra cannot reach
  transports/apps; and transports cannot reach Infra. Public/admin separation
  applies at composition roots, transport packages and shared API roots.
  Shared and Domain external imports are restricted to the normative `effect`
  runtime and `vitest` test allowlist; Node built-ins are not allowed there.
  Backend/frontend implementation layers also cannot cross. On the frontend,
  `frontend-core` cannot reach web/UI/app code and generic UI cannot reach
  product contracts, feature logic, adapters, or apps. These are package/layer
  rules; collaboration between bounded contexts still requires domain review.
- `knip` scopes its root project to root tooling and discovers only `apps/*` and
  `packages/*` workspaces. `.repos` is not a project or workspace and is never
  analyzed.
- `workspace:contracts` deterministically sorts workspace manifests and source
  files, validates exact and wildcard export targets, rejects imports of
  unexported workspace subpaths, requires direct dependency declarations, and
  rejects the same dependency in multiple manifest sections. Relative imports
  and TypeScript path aliases that cross a package boundary receive the same
  checks. Node built-ins are identified with Node's `isBuiltin` and are not
  package dependencies.

`validate:self-test` creates defective fixtures under the operating system's
temporary directory and invokes the real Effect wrapper and package scripts.
Its probes cover config-file typecheck/diagnostics/lint globs (including an
explicit-`any` React-state regression), generated-directory
exclusions, every public/admin boundary, Shared/Domain external allowlists,
workspace aliases/relative crossings, Node built-ins and wildcard exports. It
removes fixtures in `finally` and never mutates repository `apps/*` or
`packages/*`.

`static` runs all static checks in fail-fast order. `validate:pr` first runs the
self-test, then `static`, the normal implemented tests, and all builds; it does
not add PostgreSQL or browser coverage. The separate CI `postgres` job is the
real-PostgreSQL gate. CI pins the action commits, Node 22.22.2, Corepack 0.35.0
and the repository's `pnpm@10.32.1`, and installs with `--frozen-lockfile`.

### Current validation baseline (2026-08-20)

`pnpm static` has no accepted-finding baseline: every finding and warning must be fixed.
The 16 Effect projects include current TypeScript configs; the same configs are
covered by typecheck and type-aware Oxlint. Oxlint uses TypeScript 7 through
`oxlint-tsgolint`, while the normative package typecheck and Effect Language
Service continue to use the pinned stable TypeScript compiler. All 77 diagnostics
exposed by the installed Effect Language Service are configured as errors in `tsconfig.base.json`;
workspace tsconfigs inherit that plugin configuration without disabling it. A green
static run says nothing about
the separate PostgreSQL gate or pending browser suites. Knip's dependency ignores are limited
to dependencies loaded indirectly by Vite/Storybook builds, shared CSS or inline
`index.html` development bootstraps; each exception is documented in
`knip.json`.

## Current commands

```bash
pnpm validate:self-test
pnpm effect:diagnostics
pnpm typecheck
pnpm turbo run build --filter @proxus/web
pnpm lint
pnpm boundaries
pnpm knip
pnpm workspace:contracts
pnpm static
pnpm validate:pr
pnpm --filter @proxus/shared test
pnpm --filter @proxus/backend-domain test
pnpm --filter @proxus/backend-infra test
DATABASE_URL=postgresql://... pnpm --filter @proxus/backend-infra test:postgres
pnpm auth:qa:seed
pnpm auth:qa:list
pnpm --filter @proxus/backend-transport test
pnpm --filter @proxus/backend-admin-transport test
pnpm --filter @proxus/server test
pnpm --filter @proxus/admin-server test
pnpm --filter @proxus/backend-infra db:check
pnpm test
pnpm build
```

The workspace currently uses normal Vitest. Adopt `@effect/vitest` when the
concurrent design-system dependency work is stable; then use `it.effect` and
`TestClock` for scoped resources and virtual time without changing the suite
boundaries above.
