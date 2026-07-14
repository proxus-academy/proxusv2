# Effect Schema and Errors

> **Document status:** Required.

This page defines runtime data modeling, structural validation, serialization, and expected/error-channel policy for Effect v4 in this template. Examples target `effect@4.0.0-beta.58` and the current `effect/unstable/httpapi` contract.

## Policy Levels

- **Required**: must be followed at shared, transport, persistence, and integration seams.
- **Recommended**: the default when its stated condition applies.
- **Available**: supported for a specialized model; do not introduce without need.

## When and Why

Use `Schema` whenever data crosses an untrusted or process boundary: HTTP payloads and params, persisted rows, configuration, JSON, CLI input, and third-party responses. Schema provides one definition for runtime decoding/encoding and TypeScript types.

Use ordinary TypeScript types for trusted, internal, ephemeral structures that do not require runtime decoding. Do not add a schema merely to mirror a private type with no runtime seam.

Model data from records (values that contain fields together) and variants (one of several valid cases). Make invalid states unrepresentable where practical, then enforce business invariants in the owning service/use-case Module.

## Structural and Business Validation

### Required separation

Shared schemas own structural facts:

- field presence and primitive types;
- literals/enumerations;
- non-empty/format/range checks that are always invalid structurally;
- branded public IDs;
- payload nesting and wire transformations.

Domain services own product facts:

- uniqueness within a scope;
- authorization and ownership;
- lifecycle transitions;
- related entity existence when it has business meaning;
- cross-module invariants and orchestration.

Repository adapters and database constraints protect persistence integrity and races. Do not put authorization or product decisions in a schema refinement or repository decoder.

## Records with `Schema.Class`

### Required for shared composite contract models

```ts
import { Schema } from "effect"

export const UserId = Schema.String.pipe(
  Schema.check(Schema.isUUID(4)),
  Schema.brand("UserId"),
)
export type UserId = typeof UserId.Type

export class User extends Schema.Class<User>("User")({
  id: UserId,
  email: Schema.String,
  name: Schema.String,
}) {}
```

Use `typeof SchemaValue.Type` for the decoded type. Keep a schema value available; a TypeScript-only alias cannot decode runtime input.

A class may contain derived methods/getters when they are deterministic and belong to the model. Do not put repository access, network calls, or mutable global behavior on schema classes.

## Variants and Exhaustive Matching

### Required when a value has structured alternatives

Use `Schema.TaggedClass` for non-error variants and `Schema.Union` for the complete variant schema. Use `Match` for exhaustive branching.

```ts
import { Match, Schema } from "effect"

class Pending extends Schema.TaggedClass<Pending>("Pending")(
  "Pending",
  { queuedAt: Schema.Date },
) {}

class Completed extends Schema.TaggedClass<Completed>("Completed")(
  "Completed",
  { completedAt: Schema.Date },
) {}

export const JobState = Schema.Union([Pending, Completed])
export type JobState = typeof JobState.Type

export const label = (state: JobState) =>
  Match.value(state).pipe(
    Match.tag("Pending", () => "Queued"),
    Match.tag("Completed", () => "Done"),
    Match.exhaustive,
  )
```

Use `Schema.Literals([...])` for simple scalar alternatives. Prefer a structured tagged variant when each case carries different data or behavior.

### Anti-patterns

- Boolean combinations that permit contradictory states such as `isPending && isCompleted`.
- A string discriminator plus optional fields with no exhaustive schema.
- `switch` statements with an untyped/default escape hatch that hides a new variant.
- Open-ended strings where clients must branch on a finite set.

## Branded Types

### Required for public and persisted entity IDs

Public/persisted IDs in this template are branded UUID v4 strings. Services generate UUIDs with `Random.nextUUIDv4`, then decode/brand them through the shared schema before persistence or response construction.

```ts
export const TodoId = Schema.String.pipe(
  Schema.check(Schema.isUUID(4)),
  Schema.brand("TodoId"),
)
export type TodoId = typeof TodoId.Type

export const makeTodoId = Schema.decodeUnknownSync(TodoId)
```

Brands are **Recommended** for semantic primitives when confusion would be materially harmful: email addresses after normalization/validation, slugs, constrained counts, percentages, or external identifiers. Do not brand every incidental string if construction and conversion noise exceeds the safety gained.

`Brand.make(...)` (imported from `effect`) establishes the TypeScript brand but does not replace runtime validation at an untrusted seam. Decode unknown input through the schema. This repository's helper constructors use schema decoders for IDs.

## Decoding and Encoding

### Required

Decode unknown input at the seam before product logic. Encode through a schema when producing a wire or persisted representation whose encoded form differs from the in-memory type.

```ts
const decodeUser = Schema.decodeUnknownEffect(User)
const encodeUser = Schema.encodeEffect(User)
```

For a JSON string, compose JSON parsing and model validation with `Schema.fromJsonString`:

```ts
const UserFromJson = Schema.fromJsonString(User)

const user = yield* Schema.decodeUnknownEffect(UserFromJson)(json)
const encoded = yield* Schema.encodeEffect(UserFromJson)(user)
```

Do not cast `JSON.parse(...)` to a domain type. Do not decode the same payload repeatedly in handlers, services, and repositories; each seam owns one representation transition.

## Shared Contract Models

### Required

Shared API modules own domain schemas crossing client/process seams, request/response DTOs, endpoint definitions, and expected public errors. They must remain runtime-neutral and must not import server, database, browser, atom, or deployment configuration code.

A shared contract change must be classified before implementation:

- **Breaking**: removes/renames a field, changes a field type, makes optional input required, changes route/method/response incompatibly, adds auth to a public route, or changes error semantics clients must handle.
- **Non-breaking**: adds an endpoint, adds optional input, or adds an ignorable output field.
- **Migration-required**: a coordinated compatibility window supports old and new forms before removal.

Review server handlers, services, repositories if persistence changes, webapp atoms/UI, CLI/other clients, tests/fixtures, generated docs, and human docs for every shared contract change.

## Expected Errors

### Required

Define recoverable domain/transport failures with `Schema.TaggedErrorClass`. They are serializable, yieldable, and discriminated by `_tag`.

```ts
import { Effect, Schema } from "effect"
import { TodoId } from "./schema"

export class TodoNotFound extends Schema.TaggedErrorClass<TodoNotFound>()(
  "TodoNotFound",
  {
    id: TodoId,
    message: Schema.String.pipe(
      Schema.withConstructorDefault(Effect.succeed("Todo not found")),
    ),
  },
  { httpApiStatus: 404 },
) {}
```

Public error constructors accept semantic fields, not caller-selected copy:

```ts
return yield* new TodoNotFound({ id })
```

The fixed message is part of the contract. Clients branch on `_tag` and semantic fields, not on message text.

### Public HTTP status policy

Expected public errors must be declared on the endpoint/middleware contract with an intentional status/body:

- `400`: structurally/semantically invalid request where appropriate;
- `401`: missing or invalid authentication;
- `403`: authenticated but not permitted;
- `404`: resource not found in the valid scope;
- `409`: duplicate/conflict or invalid lifecycle transition where appropriate;
- `500`: safe shared internal response.

Effect v4 allows status metadata on a tagged error:

```ts
export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
  "Unauthorized",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}
```

It also supports endpoint-level `HttpApiSchema.status(...)` and no-content representations. Choose one explicit contract representation and test the generated typed client behavior. Do not expose persistence errors or raw causes in public response bodies.

### Structural decode failures

Invalid route params and payloads must fail schema/HttpApi decoding as 400-level input failures. They must not fall through to generic not-found behavior. Built-in structural validation errors do not guarantee fixed user-facing messages; UI flows needing stable copy require a deliberate shared typed domain error after structural decoding.

## Error Channels, Recovery, and Defects

### Required

Use typed errors for conditions callers can handle. Use defects for bugs and violated invariants for which local recovery is not meaningful.

Recover narrowly:

```ts
const result = program.pipe(
  Effect.catchTag("TodoNotFound", (error) => Effect.succeed({ missing: error.id })),
)
```

Handle several tags exhaustively with `Effect.catchTags`:

```ts
const recovered = program.pipe(
  Effect.catchTags({
    ValidationError: (error) => handleValidation(error),
    ConflictError: (error) => handleConflict(error),
  }),
)
```

Use `Effect.catch` only when the caller intentionally handles every remaining expected error. A generic fallback that hides materially different failures is prohibited.

Tagged errors are yieldable. In conditional branches, prefer `return yield* new DomainError(...)` so control-flow typing knows execution stops.

### Error reasons

`Effect.catchReason`, `Effect.catchReasons`, and `Effect.unwrapReason` are **Available** for a wrapper error with a tagged `reason` union. This can keep a broad foreign subsystem error from exploding method signatures while preserving structured recovery.

Use it only when the wrapper is meaningful to callers. Do not wrap unrelated domain errors merely to reduce a union. Public endpoints should still expose the concrete errors clients need to distinguish.

### Foreign errors and `Schema.Defect`

Wrap unknown thrown/rejected values at an integration seam:

```ts
class RemoteApiError extends Schema.TaggedErrorClass<RemoteApiError>()(
  "RemoteApiError",
  {
    operation: Schema.String,
    cause: Schema.Defect,
  },
) {}
```

`Schema.Defect` provides a representable cause. It does not make the cause safe for public exposure or telemetry. Public errors must omit it or map it to safe fields.

### `orDie`

`Effect.orDie` is **Available** only when a typed failure is truly unrecoverable at that point and the runtime has a top-level defect policy. Never use it for user-manageable failures, repository operations, expected auth/scope failures, or merely to simplify a type.

## Internal Persistence Errors

### Required template policy

Repository adapters surface server-only `RepositoryError` for operational failures. Services propagate it unless product semantics justify converting a result into an expected domain error. Handlers use the HTTP error-mapping seam to map repository failures and unexpected defects to a safe shared `InternalServerError`.

```ts
export class RepositoryError extends Schema.TaggedErrorClass<RepositoryError>()(
  "RepositoryError",
  {
    repository: Schema.String,
    operation: Schema.String,
  },
) {}

export class InternalServerError
  extends Schema.TaggedErrorClass<InternalServerError>()(
    "InternalServerError",
    {
      message: Schema.String.pipe(
        Schema.withConstructorDefault(Effect.succeed("Something went wrong")),
      ),
    },
    { httpApiStatus: 500 },
  ) {}
```

Do not include SQL text, database URLs, credentials, table internals, stack traces, or arbitrary causes in public errors.

## Anti-patterns

- TypeScript-only request/response types at an untrusted seam.
- `JSON.parse(value) as Model`.
- Raw strings, generic `Error`, or ad-hoc objects in expected failure channels.
- Error messages used as discriminators.
- Repository/SQL errors declared in shared contracts.
- A catch-all that returns success for authorization, conflict, timeout, and defect alike.
- `Effect.orDie` for a UI-manageable failure.
- Logging/serializing `Schema.Defect` directly to clients.
- Business invariants embedded in transport schemas.
- Contract changes made only in the server while typed clients keep stale duplicated types.

## Testing Implications

- Test successful decode and encode round trips where wire and domain representations differ.
- Test schema boundaries: malformed types, missing required fields, invalid UUIDs, literal variants, range edges, and unknown input.
- Test exhaustive variant handling so a new tag causes compile-time/test updates.
- Test service business invariants separately from structural schema failures.
- E2E tests must use the typed client and assert public error `_tag`, semantic fields, and HTTP status.
- Assert invalid params/payloads produce contract decode failures rather than not-found errors.
- Simulate repository failures at the HTTP mapping seam and assert only `InternalServerError` is exposed.
- For contract changes, update fixtures and list every reviewed consumer.

## Observability Implications

- Record error tags, owning module, and safe operation names; do not use user-controlled messages as span attributes.
- Expected errors may mark a span outcome without requiring duplicate logs at each layer.
- Internal mapping should log safe repository and operation names before returning `InternalServerError`.
- Never annotate raw payloads, secrets, SQL, emails, tokens, or `Schema.Defect` contents.
- Decode failures should be visible at the transport seam with bounded metadata such as route and schema/model name.
- Preserve causes for internal diagnostics while separating them from serialized public bodies.

## Checklist

### Required

- [ ] Every untrusted/process boundary decodes with a schema.
- [ ] Shared models use schema values and exported decoded types.
- [ ] Public/persisted entity IDs are branded UUID v4 strings.
- [ ] Structured alternatives form a tagged union with exhaustive handling.
- [ ] Structural validation and business invariants live at their proper seams.
- [ ] Expected failures use `Schema.TaggedErrorClass` and semantic fields.
- [ ] Every public error has an explicit contract status/body.
- [ ] Repository/internal failures map to safe `InternalServerError` responses.
- [ ] No raw cause or sensitive field reaches clients or telemetry.
- [ ] Contract changes are classified and all consumers reviewed.

### Recommended/Available

- [ ] Semantic primitives are branded where confusion is materially harmful.
- [ ] JSON uses `Schema.fromJsonString` rather than casts.
- [ ] Recovery uses the narrowest tag/reason combinator.
- [ ] `orDie` is limited to a justified runtime-level unrecoverable condition.
- [ ] Decode, round-trip, public-error, and safe-mapping tests cover each seam.

## Source Map

### Local sources

- `.repos/effect-smol/ai-docs/src/01_effect/01_basics/10_creating-effects.ts`
- `.repos/effect-smol/ai-docs/src/01_effect/03_errors/01_error-handling.ts`
- `.repos/effect-smol/ai-docs/src/01_effect/03_errors/10_catch-tags.ts`
- `.repos/effect-smol/ai-docs/src/01_effect/03_errors/20_reason-errors.ts`
- `.repos/effect-smol/ai-docs/src/51_http-server/fixtures/domain/User.ts`
- `.repos/effect-smol/ai-docs/src/51_http-server/fixtures/domain/UserErrors.ts`
- `.repos/effect-smol/ai-docs/src/51_http-server/fixtures/api/Authorization.ts`
- `.repos/effect-smol/ai-docs/src/51_http-server/fixtures/api/Users.ts`
- `.repos/effect-smol/ai-docs/src/51_http-server/fixtures/api/Api.ts`
- `.repos/effect-smol/ai-docs/src/51_http-server/10_basics.ts`
- `.agents/skills/api-contract-evolution/references/api-contract-rules.md`
- `packages/shared/src/modules/users/schema.ts`
- `packages/shared/src/modules/todos/errors.ts`
- `packages/shared/src/errors.ts`
- `apps/server/src/errors/repository.ts`

### External sources

- Effect Solutions, Data Modeling: https://www.effect.solutions/data-modeling
- Effect Solutions, Error Handling: https://www.effect.solutions/error-handling
- Effect Solutions, Config (schema-based validation): https://www.effect.solutions/config
- Effect Solutions, Service `use` pattern (foreign failure wrapping): https://www.effect.solutions/use-pattern
- Effect official docs, unexpected errors and `orDie`: https://effect.website/docs/error-management/unexpected-errors/#ordie

Effect Solutions and the local effect-smol snapshot demonstrate Effect v4 facilities. Shared-contract ownership, UUID policy, status choices, persistence error mapping, and consumer-review rules are template policy and are not presented as upstream requirements.
