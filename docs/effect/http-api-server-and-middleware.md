# Effect HTTP API Servers and Middleware

This guide explains the reusable Effect `HttpApi` patterns used by this template. For the repository's concrete modules, endpoints, paths, and public error policy, see [`../api.md`](../api.md); that document remains the project source of truth.

> **API stability:** the examples use `effect/unstable/httpapi` and `effect/unstable/http`. Verify imports and signatures when upgrading Effect.

## Architecture at a glance

Define the wire contract once, outside the server implementation, and derive both server and clients from it:

```text
packages/shared: schemas -> endpoint groups -> root HttpApi
                                      |             |
                                      v             v
apps/server: middleware + handlers   OpenAPI   runtime-local typed clients
                    |
                    v
          service/use case -> repository interface -> adapter
```

The shared contract owns everything visible across the process boundary:

- path, method, route params, query, headers, and payload schemas;
- success schemas and content types;
- typed public errors and their HTTP statuses/bodies;
- middleware and security requirements visible to clients;
- API/group/endpoint OpenAPI metadata.

It does **not** own database rows, repositories, server configuration, token verification implementations, browser lifecycle, or UI state.

## Schema-first contracts

### Domain schemas and IDs

Use `Schema.Class` (or an equivalent schema) for public models and branded schemas for public/persisted IDs. Path params arrive as strings, so their schema must decode from the transport representation into the branded domain type.

```ts
import { Schema } from "effect"
import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi"

export const ProjectId = Schema.String.pipe(
  Schema.check(Schema.isUUID(4)),
  Schema.brand("ProjectId"),
)
export type ProjectId = typeof ProjectId.Type

export class Project extends Schema.Class<Project>("Project")({
  id: ProjectId,
  name: Schema.NonEmptyString,
}) {}

export class ProjectNotFound extends Schema.TaggedErrorClass<ProjectNotFound>()(
  "ProjectNotFound",
  { id: ProjectId, message: Schema.String },
  { httpApiStatus: 404 },
) {}

export class ProjectsApi extends HttpApiGroup.make("projects")
  .add(
    HttpApiEndpoint.get("getById", "/:id", {
      params: { id: ProjectId },
      success: Project,
      error: ProjectNotFound,
    }),
    HttpApiEndpoint.post("create", "/", {
      payload: Schema.Struct({ name: Schema.NonEmptyString }),
      success: Project.pipe(HttpApiSchema.status(201)),
    }),
  )
  .prefix("/projects") {}
```

If a branded schema does not itself decode the path's string form, bridge the representations explicitly with `Schema.decodeTo(...)`; never parse an ID ad hoc in the handler. In this project, public entity IDs are branded UUID strings and malformed route IDs are request-decoding failures, not `NotFound` results.

### Inputs and representations

`HttpApiEndpoint` can describe:

- `params` for path captures;
- `query` for query parameters;
- `payload` (GET payloads map to query data; write payloads normally map to a body);
- `headers` when headers are part of the endpoint contract;
- `success` and `error` schemas.

JSON is the normal representation, but contract schemas may explicitly select text, CSV, multipart, no-content, or another representation through `HttpApiSchema`. Multiple success representations are possible, but use them only when content negotiation is a real product requirement. A no-content error still needs a decoder if the typed client must reconstruct an error value.

Keep **structural validation** in shared schemas: required fields, types, transport decoding, enums, and constraints that are always invalid. Keep **business validation** in services: uniqueness, lifecycle rules, authorization, relationship checks, and scoped existence. Database constraints remain the final integrity/race-condition defense.

### Groups, root API, and OpenAPI

Compose endpoints into cohesive groups and groups into one root API. `topLevel: true` exposes operations directly on the generated client; otherwise the group is namespaced.

```ts
import { HttpApi, OpenApi } from "effect/unstable/httpapi"

export class AppApi extends HttpApi.make("app-api")
  .add(SystemApi)
  .add(ProjectsApi)
  .annotateMerge(
    OpenApi.annotations({ title: "Application API" }),
  ) {}
```

Descriptions and other OpenAPI annotations can be merged at API, group, endpoint, parameter, and request-body level. Generated documentation is a projection of the contract, not a substitute for domain and operational documentation.

## Public errors and status semantics

Every expected failure that a client must branch on, present specially, retry differently, or use for navigation belongs in the shared endpoint error schema. Assign an explicit status and a stable, safe body. Constructor defaults should own fixed public messages; callers supply semantic data, not copy.

Typical semantics:

| Status | Meaning |
| --- | --- |
| 400/422 | Structurally or semantically invalid input, as deliberately modeled |
| 401 | Missing, invalid, or expired authentication |
| 403 | Authenticated actor lacks permission for the operation |
| 404 | Resource is absent **within the actor's valid scope** |
| 409 | Conflict such as uniqueness or an invalid lifecycle transition |
| 500 | Safe shared internal error; no persistence details |

Effect HttpApi/schema request-decoding errors cover malformed params, query, and payloads. Domain errors cover validly decoded requests that violate product rules. Repository/SQL failures are server-only and must be mapped at the HTTP seam to the safe shared `InternalServerError`; do not expose SQL messages, defects, or stack traces. Do not use `Effect.orDie` for a user-manageable failure merely to satisfy a handler type.

Contract changes must be classified as breaking, non-breaking, or migration-required, and all consumers must be reviewed. Renaming fields/routes, changing types or response shapes, adding authentication, or changing typed error semantics is normally breaking. Prefer additive/deprecation windows where coordinated rollout is needed.

## Thin handlers

A handler adapts decoded transport input and middleware-provided context to a service call. It should not contain product behavior or call repositories.

```ts
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

export const ProjectsHandlers = HttpApiBuilder.group(
  AppApi,
  "projects",
  Effect.fn(function* (handlers) {
    const projects = yield* Projects

    return handlers
      .handle("getById", ({ params }) =>
        projects.getById(params.id).pipe(withHttpErrorMapping),
      )
      .handle("create", ({ payload }) =>
        projects.create(payload).pipe(withHttpErrorMapping),
      )
  }),
).pipe(Layer.provide(Projects.layer))
```

The required flow is:

```text
HTTP handler -> Service/use-case Module -> Repository Interface -> Adapter
```

Handlers may:

- receive already-decoded params/query/payload;
- read actor/scope services supplied by middleware;
- pass explicit actor/scope context to the service;
- select a declared representation;
- map internal failures to declared safe HTTP errors;
- add transport-level spans/annotations.

Services own normalization, UUID generation, authorization/product decisions, repository coordination, and conversion to shared contract models.

## Middleware and security

### Shared declaration

Declare middleware in the shared contract when its requirement affects clients or OpenAPI. Middleware may declare:

- `security`, such as bearer credentials;
- typed public errors;
- services it `provides` to downstream middleware/handlers;
- services it `requires` from earlier middleware;
- `requiredForClient: true` when generated clients must install a matching client implementation.

```ts
import { Context, Schema } from "effect"
import {
  HttpApiMiddleware,
  HttpApiSecurity,
} from "effect/unstable/httpapi"

export class CurrentActor extends Context.Service<CurrentActor, Actor>()(
  "app/http/CurrentActor",
) {}

export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
  "Unauthorized",
  { message: Schema.String },
  { httpApiStatus: 401 },
) {}

export class Authorization extends HttpApiMiddleware.Service<
  Authorization,
  { provides: CurrentActor; requires: never }
>()("app/http/Authorization", {
  requiredForClient: true,
  security: { bearer: HttpApiSecurity.bearer },
  error: Unauthorized,
}) {}
```

Apply middleware to a group for a common policy or to individual endpoints for finer granularity. Public health/login endpoints should not accidentally inherit protected-group middleware.

### Server implementation

The server layer extracts and verifies credentials and provides validated context to the rest of the request:

```ts
import { Effect, Layer, Redacted } from "effect"

export const AuthorizationLive = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const sessions = yield* Sessions

    return Authorization.of({
      bearer: Effect.fn(function* (httpEffect, { credential }) {
        const actor = yield* sessions.verify(Redacted.value(credential))
        return yield* Effect.provideService(httpEffect, CurrentActor, actor)
      }),
    })
  }),
)
```

Keep credentials redacted and never log or annotate their values. Authentication middleware may extract credentials, verify sessions/tokens, load the actor, resolve generic scope context, and validate membership needed to provide that context. It must not become a home for module-specific permission rules.

### Authentication is not authorization

Keep four decisions explicit:

1. **Authentication:** who is the actor?
2. **Scope resolution:** in which tenant/account/workspace/project does this request operate?
3. **Membership/access grant:** why may the actor enter that scope?
4. **Authorization:** what may the actor do there?

A client-provided route/header/payload scope is only a claim. Middleware or an access service must validate it before providing scope context. Handlers pass context onward; domain/access services enforce product permissions. Scoped repositories require scope explicitly (`getByIdInWorkspace`, not global `getById`). Looking up an object from another scope should normally return the same `404` as a missing object, preventing existence leaks.

## Client-side middleware counterpart

When middleware is `requiredForClient`, provide its generated-client implementation with `HttpApiMiddleware.layerClient`. It transforms the outgoing request and calls `next`:

```ts
export const AuthorizationClient = HttpApiMiddleware.layerClient(
  Authorization,
  Effect.fn(function* ({ next, request }) {
    const token = yield* SessionToken
    return yield* next(HttpClientRequest.bearerToken(request, token.value))
  }),
)
```

For this template's browser session-cookie authentication, credentials/cookie behavior belongs in the webapp runtime adapter rather than a shared client package. Never embed a production token in a layer.

## Runtime assembly

Build routes from the root API and handler layers. The builder can expose OpenAPI JSON, and a Scalar layer can add interactive documentation:

```ts
const ApiRoutes = HttpApiBuilder.layer(AppApi, {
  openapiPath: "/openapi.json",
}).pipe(Layer.provide([ProjectsHandlers, SystemHandlers]))

const DocsRoute = HttpApiScalar.layer(AppApi, { path: "/docs" })
const Routes = Layer.mergeAll(ApiRoutes, DocsRoute)
```

Serve with the platform-specific server layer:

```ts
const Server = HttpRouter.serve(Routes).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
)

Layer.launch(Server).pipe(NodeRuntime.runMain)
```

For serverless adapters and local tests, convert the same routes to a web handler with `HttpRouter.toWebHandler(...)`. Dispose scoped resources when the returned adapter exposes a disposer. The project uses this no-listener path for its canonical local e2e suite; opening an ephemeral TCP port is reserved for transport-specific tests.

## Security checklist

- Declare auth/security and public auth errors in the shared contract.
- Keep credential values in `Redacted` form and out of logs, traces, and error bodies.
- Validate session/token expiry, signature, audience/issuer, and revocation as applicable.
- Treat client-provided scope as untrusted until membership/access validation succeeds.
- Pass actor and scope explicitly into domain services and scoped repository methods.
- Use `401` for failed authentication, `403` for known permission denial, and scope-safe `404` for inaccessible resources.
- Constrain body/header/query sizes and supported content types at the transport boundary.
- Configure CORS, cookies (`HttpOnly`, `Secure`, `SameSite`), CSRF protection, forwarded headers, and trusted proxies in the owning runtime layer.
- Return fixed safe public errors; never serialize defects or persistence failures.
- Add cross-scope list/get/update/delete tests for every scoped module.

## Sources and precedence

1. Project rules: [`../api.md`](../api.md), [`../testing.md`](../testing.md), and `AGENTS.md`.
2. Effect Smol AI docs: `ai-docs/src/51_http-server`, including its API, middleware, handler, server, OpenAPI, web-handler, and typed-client fixtures.

The Effect Smol fixture is illustrative: this template strengthens it with UUID IDs, service/repository separation, safe annotations, and explicit SaaS scope isolation.