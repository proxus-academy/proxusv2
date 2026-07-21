# Testing Effect Applications

This guide covers Effect-specific testing techniques and the template's required layered strategy. The repository's concrete commands, helper names, paths, frontend conventions, and smoke workflow remain in [`../testing.md`](../testing.md); avoid duplicating those details here.

> **Secondary-source notice:** the Effect Solutions **Testing** page was published in the production index when reviewed. Its `@effect/vitest`, scoped-resource, and `TestClock` examples are incorporated here only where consistent with Effect Smol and project rules.

## Test the smallest meaningful layer

```text
many   service/use-case + in-memory repository contracts
some   SQL repository + isolated temporary SQL
some   service + SQL repositories + isolated temporary SQL
few    typed client + in-process HTTP app + temporary PGlite
```

Choose dependencies from the unit under test, not from convenience:

| Unit under test | Real dependencies | Replaced dependencies | Primary assertions |
| --- | --- | --- | --- |
| Pure/domain function | None | None | values, schema behavior, invariants |
| Domain service/use case | Service implementation | repository interfaces, external gateways, transaction abstraction | business rules, normalization, orchestration, typed errors |
| SQL repository | repository adapter, SQL engine, migrations | production database only | queries, constraints, row decoding, internal error mapping |
| Service SQL integration | service, repositories, SQL | external systems as needed | cross-layer wiring and transactions |
| HTTP handler | handler/contract; usually real service | lower dependencies according to test goal | transport adaptation, auth context, statuses, decoding |
| E2E API | shared contract, handlers, services, PGlite adapters | TCP and external systems | black-box public behavior |

Do not mock the layer being tested. Do not use a development/production database. Do not leak SQL row shapes into service tests or make services depend on `SqlClient` just to simplify tests.

## `@effect/vitest`

Use Effect-aware test functions so Effects, scopes, failures, and test services are handled by the test runner:

```ts
import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

describe("normalize", () => {
  it.effect("runs an Effect program", () =>
    Effect.gen(function* () {
      const value = yield* normalize(" Ada ")
      assert.strictEqual(value, "ada")
    }),
  )

  it.effect.each([
    { input: " A ", expected: "a" },
    { input: " B ", expected: "b" },
  ])("normalizes case %#", ({ input, expected }) =>
    Effect.gen(function* () {
      assert.strictEqual(yield* normalize(input), expected)
    }),
  )

  it.effect.prop("trimming is idempotent", [Schema.String], ([value]) =>
    Effect.sync(() => {
      assert.strictEqual(value.trim().trim(), value.trim())
    }),
  )
})
```

Useful variants include:

- `it.effect`: normal Effect test with test services;
- `it.live`: real runtime services such as wall-clock time; use sparingly;
- `it.effect.each`: parameterized Effect tests;
- `it.effect.prop`: schema-generated property tests;
- `.skip` and `.only`: temporary local controls (never commit accidental `.only`);
- `.fails`: documents a known failing test, but is not a substitute for an issue and repair plan.

Scoped resources acquired inside `it.effect` are finalized when the test's scope closes. This is appropriate for temporary directories, clients, servers, and other resources with finalizers.

Logging is commonly suppressed in Effect tests. Provide a logger only when log behavior is itself under test or output is needed to diagnose a failure; avoid making assertions depend on incidental console formatting.

## Deterministic time with `TestClock`

`it.effect` provides test services, including a virtual clock. Start the sleeping/retrying work in a child fiber, advance virtual time, then join:

```ts
import { Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"

it.effect("expires after one minute", () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(
      expireSession.pipe(Effect.delay("1 minute")),
    )

    yield* TestClock.adjust("1 minute")
    yield* Fiber.join(fiber)

    assert.isTrue(yield* sessionIsExpired)
  }),
)
```

Use virtual time for sleeps, retries/backoff, debouncing, polling, cache TTL, token/session expiry, scheduled cleanup, and timeout races. Fork before adjusting so the test clock can observe the suspended fiber. Advance only as far as the behavior requires and assert intermediate states when timing order matters.

Use `it.live` only for behavior that genuinely depends on real runtime time or integration with an external clock. Real sleeps make unit suites slow and flaky.

When randomness matters, provide deterministic test randomness or an explicit random service. Assert invariants rather than coupling tests to incidental generated sequences unless the sequence is the behavior under test.

## Test layers and state isolation

Provide dependencies explicitly:

```ts
it.effect("returns a conflict for a duplicate", () =>
  Effect.gen(function* () {
    const users = yield* Users
    yield* users.create(aliceInput)

    const error = yield* users.create(aliceInput).pipe(Effect.flip)
    assert.strictEqual(error._tag, "UserAlreadyExists")
  }).pipe(Effect.provide(UsersDomainTestLayer)),
)
```

Prefer small, concrete layer constructors over broad generic helpers or casts that hide unresolved requirements.

`Layer.provide` satisfies dependencies. `Layer.provideMerge` also exposes the provided service to the resulting environment, which is useful when tests need a fixture/ref service for arrange/assert steps. Avoid exposing implementation internals by default.

`@effect/vitest` also supports a shared `layer(...)` block whose scoped layer is created once and torn down after the block. State is therefore shared between tests in that block. Use it only for an expensive resource whose exposed state is immutable or reset before every test; never depend on test order or mutation left by another test. For product tests, a fresh layer per test is safer.

## In-memory repository layers

In-memory repositories implement the exact production repository contract and use layer-scoped state, normally a `Ref` containing a map or records.

Rules:

- seed domain entities or repository DTOs, never SQL rows;
- match production missing-record semantics (`null`, `Option`, or typed error as declared);
- model scoped methods and uniqueness closely enough to test domain behavior;
- avoid module/global mutable stores;
- expose test inspection state only when assertions cannot use public service behavior;
- provide `InMemoryTransactionsLayer` when a service requires transactions.

The in-memory transaction adapter is a no-op composition boundary. It does not prove rollback. Rollback must be tested against a real SQL transaction adapter.

Service tests should cover ID generation/branding, normalization, product validation, authorization and ownership, missing-reference mapping, multi-repository coordination, and conversion to shared models.

## Temporary SQL and repository tests

**Project rule:** persistent adapter tests use an isolated temporary SQL database, and canonical API e2e tests use temporary PGlite. Never point tests at development or production data.

A test SQL layer should:

1. create a scoped temporary directory/file (a file database is generally closer to app behavior than `:memory:`);
2. construct the PGlite client;
3. run the same numbered Effect SQL migration runner used by production;
4. omit demo seeds by default;
5. release filesystem/database resources when the scope closes.

Use explicit options such as:

```text
migrate: true, seed: false    normal repository/e2e test
migrate: true, seed: true     only when demo seed behavior is relevant
migrate: false                migration-runner test starting from empty DB
```

Repository integration tests exercise each persistent operation through the actual adapter and `SqlSchema`. Assert insert/update/get/list behavior, row-to-record decoding, constraints, scoped uniqueness, read-back, missing rows, and safe `RepositoryError` mapping. PGlite and Postgres adapters need adapter-relevant coverage; do not extend legacy JSON/Drizzle persistence.

Migration tests call the shared runner directly and inspect `effect_sql_migrations` plus the PGlite catalog (`PRAGMA table_info`, `PRAGMA index_list`, and similar). Schema migrations must not depend on demo data.

## Transactions

Domain services depend on a storage-neutral transaction service:

```ts
export class Transactions extends Context.Service<
  Transactions,
  {
    readonly withTransaction: <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E, R>
  }
>()("app/database/Transactions") {}
```

- SQL integration provides `SqlTransactionsLayer` backed by `sql.withTransaction`.
- Fast service tests provide `InMemoryTransactionsLayer` as identity.
- Rollback, atomicity, and constraint races are verified with real temporary SQL.
- Never leak `SqlClient` into services or cast away transaction-layer requirements.

## Canonical local HTTP e2e

**Project rule:** e2e is Effect-native, no-network by default, and black-box through the shared typed client:

1. Create a temporary PGlite database per file/suite.
2. Run shared migrations; do not globally seed application state.
3. Compose canonical repository, domain, auth/session, middleware, and handler layers through project helpers.
4. Build the real routes without opening a listener.
5. Convert them to `Request -> Response` with `HttpRouter.toWebHandler(...)`.
6. Inject a local `FetchHttpClient.Fetch` that calls that handler, using a placeholder origin such as `http://app.test`.
7. Keep session-cookie state in a test-local `Ref<string | null>`.
8. Register/login and create resources through public typed-client calls.
9. Dispose scoped route/database resources.

Assert:

- typed success bodies;
- declared error tags, fixed safe bodies, and statuses;
- malformed UUID/path/body input as built-in 400-level decoding failure;
- protected endpoints with and without valid session cookies;
- repository/operational failure mapping to shared `InternalServerError`;
- response headers/cookies when those are the behavior under test.

Use an ephemeral TCP listener only for transport-specific behavior that the web handler cannot represent.

## Authentication and cross-scope isolation

For every scoped module, build at least two actors, two scopes, memberships/access grants, and resources in each scope. Verify:

- actor A lists only scope A records;
- actor A cannot read, update, or delete scope B records;
- cross-scope lookup is the same `404` as absent-in-scope, preventing existence leaks;
- missing/invalid auth is `401`;
- authenticated but unauthorized operation is `403` where disclosure is safe;
- client-supplied scope IDs do not bypass membership validation;
- repository methods always receive explicit validated scope.

Test authorization primarily in domain/access services with in-memory repositories, repository scope filtering with temporary SQL, and the complete auth/middleware/status contract in a focused e2e set.

## Failure and concurrency tests

- Assert typed expected errors with tags and semantic fields, not only message text.
- Assert defects/internal causes only at the layer that owns them; HTTP should expose the safe public mapping.
- Fork fibers to test concurrency, cancellation, interruption, races, semaphore limits, and transaction conflicts.
- Avoid timing assertions based on wall-clock milliseconds.
- Verify finalizers run on success, typed failure, defect, and interruption for resource-owning code.
- Use property tests for schema round trips, normalization idempotence, codecs, and broad invariant spaces.

## Observability in tests

Do not send ordinary unit/integration telemetry to production collectors. Install a test logger/tracer only when asserting span/log behavior or diagnosing failures. Telemetry assertions should check stable operation names and safe attributes, not timestamps, generated span IDs, raw PII, or exporter formatting.

Source maps belong to test/runtime build configuration rather than test logic. Preserve them for useful stack traces, while applying the publication/access controls described in [`observability.md`](./observability.md).

## Checklist

- Identify the layer and minimal dependency graph before writing the test.
- Use `it.effect`; use `it.live` only when real services are essential.
- Use `TestClock` for time, retries, expiration, and polling.
- Scope mutable state per test layer; shared `layer(...)` state must be deliberate.
- Mock repository/gateway interfaces for service tests, not the service under test.
- Use temporary migrated SQL for repository, rollback, and SQL integration behavior.
- Use temporary PGlite + typed client + in-process web handler for canonical e2e.
- Create application context through public calls in e2e tests.
- Add 401/403/404 and cross-scope isolation coverage for scoped resources.
- Do not hide missing layers with broad casts.
- Run the concrete validation commands listed in [`../testing.md`](../testing.md) and `AGENTS.md`.

## Sources and precedence

1. Project rules: [`../testing.md`](../testing.md), [`../api.md`](../api.md), and `AGENTS.md`.
2. Effect Smol AI docs: `ai-docs/src/09_testing`.
3. Local skills: Effect layered testing and SaaS auth/scope architecture.
4. **Published secondary reference:** Effect Solutions, “Testing” (`https://www.effect.solutions/testing`), retrieved 2026-07-10.
