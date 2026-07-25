> Portado de [`Effect-TS/effect/ai-docs/src/51_http-server`](https://github.com/Effect-TS/effect/tree/b49284193f86737e411dc3dd19cfb1a8b9fa5d95/ai-docs/src/51_http-server) en el commit `b49284193f86737e411dc3dd19cfb1a8b9fa5d95` (licencia MIT).
> Upstream usa Effect `4.0.0-beta.101`; Proxus usa `4.0.0-beta.98`. Verifica los tipos instalados antes de adoptar un ejemplo.


## Building HttpApi servers

`HttpApi` gives you schema-first, type-safe HTTP APIs with runtime validation, typed clients, and OpenAPI docs from one definition.

## Getting started with HttpApi

Source: `51_http-server/10_basics.ts`.

```ts
/**
 * @title Getting started with HttpApi
 *
 * Define a schema-first API, implement handlers, secure endpoints with
 * middleware, serve it over HTTP, and call it using a generated typed client.
 */
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Context, Effect, flow, Layer, Schedule } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiClient, HttpApiMiddleware, HttpApiScalar } from "effect/unstable/httpapi"
import { createServer } from "node:http"
// Api definitions should **always** be seperate from the server implementation,
// so that they can be shared between the server and client without leaking
// server code into clients.
// Ideally, the would use a seperate package in a monorepo.
import { Api } from "./fixtures/api/Api.ts"
import { Authorization } from "./fixtures/api/Authorization.ts"
import { UsersApiHandlers } from "./fixtures/server/Users/http.ts"

// This walkthrough focuses on runtime wiring and typed client usage.
// See the fixture files for the API schemas, endpoint definitions and handlers:

const SystemApiHandlers = HttpApiBuilder.group(
  Api,
  "system",
  Effect.fn(function*(handlers) {
    return handlers.handle("health", () => Effect.void)
  })
)

const ApiRoutes = HttpApiBuilder.layer(Api, {
  openapiPath: "/openapi.json"
}).pipe(
  // Provide all the handler Layers for the API.
  Layer.provide([UsersApiHandlers, SystemApiHandlers])
)

// Define a /docs route that serves scalar documentation
const DocsRoute = HttpApiScalar.layer(Api, {
  path: "/docs"
})

// Merge all the http routes together
const AllRoutes = Layer.mergeAll(ApiRoutes, DocsRoute)

// Create an HTTP server Layer that serves the API routes.
//
// Here we are using the NodeHttpServer, but you could also use the
// BunHttpServer
export const HttpServerLayer = HttpRouter.serve(AllRoutes).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
)

// Then run the server using Layer.launch
Layer.launch(HttpServerLayer).pipe(
  NodeRuntime.runMain
)

// Or create a web handler, which can be used in serverless environments
export const { handler, dispose } = HttpRouter.toWebHandler(AllRoutes.pipe(
  Layer.provide(HttpServer.layerServices)
))

// -----------------
// Client side setup
// -----------------

export const AuthorizationClient = HttpApiMiddleware.layerClient(
  Authorization,
  Effect.fn(function*({ next, request }) {
    // Here you can modify the request and pass it down the middleware chain.
    // This is where you would add authentication tokens, custom headers, etc.
    // For this example, we just add a hardcoded bearer token to all requests.
    return yield* next(HttpClientRequest.bearerToken(request, "dev-token"))
  })
)

// Define the HttpApiClient service, which will be used to make requests to the
// API.
export class ApiClient extends Context.Service<ApiClient, HttpApiClient.ForApi<typeof Api>>()("acme/ApiClient") {
  static readonly layer = Layer.effect(
    ApiClient,
    HttpApiClient.make(Api, {
      // Use transformClient to apply middleware to the generated client. This
      // is useful for settings the base url and applying retry policies.
      transformClient: (client) =>
        client.pipe(
          HttpClient.mapRequest(flow(
            HttpClientRequest.prependUrl("http://localhost:3000")
          )),
          HttpClient.retryTransient({
            schedule: Schedule.exponential(100),
            times: 3
          })
        )
    })
  ).pipe(
    // Provide the client implementation of the Authorization middleware, which
    // is required.
    Layer.provide(AuthorizationClient),
    // Supply a HttpClient implementation to use for making requests. Here we
    // use the FetchHttpClient, but you could also use the NodeHttpClient or
    // BunHttpClient.
    Layer.provide(FetchHttpClient.layer)
  )
}

// The generated client mirrors your API definition, so renames and schema
// changes are checked end-to-end at compile time.
export const callApi = Effect.gen(function*() {
  const client = yield* ApiClient

  yield* client.health()
}).pipe(
  Effect.provide(ApiClient.layer)
)
```

## Supporting fixtures

These files complete the real-world structure used by the examples.

### `fixtures/api/Api.ts`

```ts
import { HttpApi, OpenApi } from "effect/unstable/httpapi"
import { SystemApi } from "./System.ts"
import { UsersApiGroup } from "./Users.ts"

// Defined the root API, which combines all of the groups together. This is the
// API that you will serve and generate clients for. You can also annotate the
// API with OpenAPI metadata.
export class Api extends HttpApi.make("user-api")
  .add(UsersApiGroup)
  .add(SystemApi)
  .annotateMerge(OpenApi.annotations({
    title: "Acme User API"
  }))
{}
```

### `fixtures/api/Authorization.ts`

```ts
import { Context, Schema } from "effect"
import { HttpApiMiddleware, HttpApiSecurity } from "effect/unstable/httpapi"
import type { User } from "../domain/User.ts"

export class CurrentUser extends Context.Service<CurrentUser, User>()("acme/HttpApi/Authorization/CurrentUser") {}

export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
  "Unauthorized",
  {
    message: Schema.String
  },
  // You can define error status codes directly on the error class
  { httpApiStatus: 401 }
) {}

export class Authorization extends HttpApiMiddleware.Service<Authorization, {
  // Middleware can provide services to other middleware and endpoints, which is
  // useful for things like authentication, where you want to inject the current
  // user into the context for other endpoints to consume.
  provides: CurrentUser
  // If your middleware requires dependencies from other middleware, you can
  // specify those as well.
  requires: never
}>()("acme/HttpApi/Authorization", {
  // This middleware requires clients to also provide an implementation, to
  // inject a api key
  requiredForClient: true,
  // Middleware can optionally define security schemes, which are used to
  // generate OpenAPI docs and decode credientials from incoming requests for
  // you.
  security: {
    bearer: HttpApiSecurity.bearer
  },
  // Middlware can specify errors that it may raise
  error: Unauthorized
}) {}
```

### `fixtures/api/System.ts`

```ts
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"

// Top level groups are added to the root of the derived HttpApiClient.
//
// `client.health()`
export class SystemApi extends HttpApiGroup.make("system", { topLevel: true }).add(
  HttpApiEndpoint.get("health", "/health", {
    success: HttpApiSchema.NoContent
  })
) {}
```

### `fixtures/api/Users.ts`

```ts
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { User, UserId } from "../domain/User.ts"
import { SearchQueryTooShort, UserNotFound } from "../domain/UserErrors.ts"
import { Authorization } from "./Authorization.ts"

export class UsersApiGroup extends HttpApiGroup.make("users")
  .add(
    HttpApiEndpoint.get("list", "/", {
      query: {
        search: Schema.optional(Schema.String)
      },
      success: Schema.Array(User)
    }),
    HttpApiEndpoint.get("search", "/search", {
      // For get requests, payload uses the query string
      payload: {
        search: Schema.String
      },
      success: [
        Schema.Array(User),
        Schema.String.pipe(HttpApiSchema.asText({
          contentType: "text/csv"
        }))
      ],
      error: [
        SearchQueryTooShort.pipe(
          // If you want an error to return no content, you can use
          // `HttpApiSchema.asNoContent` and provide a decoder that transforms the
          // error into the appropriate type.
          HttpApiSchema.asNoContent({
            decode: () => new SearchQueryTooShort()
          })
        ),
        // You can also add some of the built in `HttpApiError`s to handle common
        // error cases like bad requests, unauthorized, etc.
        HttpApiError.RequestTimeoutNoContent
      ]
    }),
    HttpApiEndpoint.get("getById", "/:id", {
      params: {
        // Path parameter schemas need to be able to decode from strings.
        // Schema.decodeTo can be used to "bridge" between schemas
        id: Schema.FiniteFromString.pipe(
          Schema.decodeTo(UserId)
        )
      },
      success: User,
      error: UserNotFound.pipe(
        // If you want an error to return no content, you can use
        // `HttpApiSchema.asNoContent` and provide a decoder that transforms the
        // error into the appropriate type.
        HttpApiSchema.asNoContent({
          decode: () => new UserNotFound()
        })
      )
    }),
    HttpApiEndpoint.post("create", "/", {
      // For post requests, payload uses the request body. It defaults to JSON,
      // but you can specify other content types as well using
      // `HttpApiSchema.asText`, `HttpApiSchema.asMultipart`, etc.
      payload: Schema.Struct({
        name: Schema.String,
        email: Schema.String
      }),
      success: User
    }),
    HttpApiEndpoint.get("me", "/me", {
      success: User,
      error: UserNotFound.pipe(HttpApiSchema.status(404))
    })
  )
  // You can apply middleware to entire groups, which is useful for things like
  // authentication and authorization.
  //
  // You can also apply middleware to individual endpoints if you need more
  // fine-grained control.
  .middleware(Authorization)
  // To add a common prefix to all endpoints in a group, you can use the `prefix`
  // method. This is useful for grouping related endpoints together under a common
  // path segment. In this case, all endpoints in the `UsersApiGroup` will be
  // prefixed with `/users`.
  .prefix("/users")
  // You can add OpenAPI annotations to groups, endpoints, and even parameters and
  // request bodies. These will be merged together to generate the final OpenAPI
  // docs for the API
  .annotateMerge(OpenApi.annotations({
    title: "Users",
    description: "User management endpoints"
  }))
{}
```

### `fixtures/domain/User.ts`

```ts
import { Schema } from "effect"

export const UserId = Schema.Int.pipe(
  Schema.brand("UserId")
)
export type UserId = typeof UserId.Type

export class User extends Schema.Class<User>("User")({
  id: UserId,
  name: Schema.String,
  email: Schema.String
}) {}
```

### `fixtures/domain/UserErrors.ts`

```ts
import { Schema } from "effect"

export class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
  "UserNotFound",
  {},
  // You can specify the status code for this error inline
  { httpApiStatus: 404 }
) {}

export class SearchQueryTooShort
  extends Schema.TaggedErrorClass<SearchQueryTooShort>()("SearchQueryTooShort", {}, { httpApiStatus: 422 })
{
  static readonly minimumLength = 2
}

// Create a wrapper error class for all errors in the Users API.
//
// This prevents adding too many error types to services / endpoint definitions.
//
export class UsersError extends Schema.TaggedErrorClass<UsersError>()("UsersError", {
  reason: Schema.Union([UserNotFound, SearchQueryTooShort])
}) {}
```

### `fixtures/server/Authorization.ts`

```ts
import { Effect, Layer, Redacted } from "effect"
import { Authorization, CurrentUser, Unauthorized } from "../api/Authorization.ts"
import { User, UserId } from "../domain/User.ts"

// The implementation of the Authorization middleware. It is seperate from the
// service definition to avoid leaking it into a client.
export const AuthorizationLayer = Layer.effect(
  Authorization,
  Effect.gen(function*() {
    // Here you could access services required by the middleware, like a
    // database or an external auth provider.
    yield* Effect.logInfo("Starting Authorization middleware")

    return Authorization.of({
      bearer: Effect.fn(function*(httpEffect, { credential }) {
        // Validate the token and return an Unauthorized error if it's invalid.
        const token = Redacted.value(credential)
        if (token !== "dev-token") {
          return yield* new Unauthorized({ message: "Missing or invalid bearer token" })
        }

        // Provide the current user to the rest of the stack. This will be
        // available in any endpoint or middleware that runs after this one.
        return yield* Effect.provideService(
          httpEffect,
          CurrentUser,
          new User({
            id: UserId.make(1),
            name: "Dev User",
            email: "dev@acme.com"
          })
        )
      })
    })
  })
)
```

### `fixtures/server/Users/http.ts`

```ts
import { Effect, Layer } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { Api } from "../../api/Api.ts"
import { CurrentUser } from "../../api/Authorization.ts"
import { AuthorizationLayer } from "../Authorization.ts"
import { Users } from "../Users.ts"

export const UsersApiHandlers = HttpApiBuilder.group(
  Api,
  "users",
  Effect.fn(function*(handlers) {
    const users = yield* Users

    return handlers
      .handle("list", ({ query }) =>
        users.list(query.search).pipe(
          // The list endpoint expects no errors, so we convert any potential
          // errors into a 500 Internal Server Error.
          Effect.orDie
        ))
      .handle(
        "search",
        Effect.fn(function*({ payload }) {
          if (payload.search === "bad-request") {
            // You can use the built in error types like any other
            // Schema.TaggedErrorClass
            return yield* new HttpApiError.RequestTimeout()
          }
          return yield* users.list(payload.search).pipe(
            Effect.catchReason(
              "UsersError",
              "SearchQueryTooShort",
              // Re-fail the "SearchQueryTooShort" reason
              Effect.fail,
              // All other reasons are unexpected, so we convert them into a 500
              // Internal Server Error.
              Effect.die
            )
          )
        })
      )
      .handle("getById", ({ params }) =>
        users.getById(params.id).pipe(
          // You can also use Effect.catchReasons to handle multiple error
          // reasons at once
          Effect.catchReasons("UsersError", {
            UserNotFound: (e) => Effect.fail(e)
          }, Effect.die)
        ))
      .handle("create", ({ payload }) =>
        users.create(payload).pipe(
          Effect.orDie
          // You could alse use Effect.unwrapReason to moves rror reasons up to
          // the top level, so you can handle them with Effect.catch or
          // Effect.catchTag etc.
          //
          // Effect.unwrapReason("UsersError"),
          // Effect.catchTags({
          //   UserNotFound: Effect.die,
          //   SearchQueryTooShort: Effect.die
          // })
        ))
      .handle("me", () =>
        // The Authorization middleware provides the CurrentUser service, so we
        // can access it here.
        CurrentUser)
  })
).pipe(
  // Provide the dependencies for the handlers.
  Layer.provide([Users.layer, AuthorizationLayer])
)
```

### `fixtures/server/Users.ts`

```ts
import { Context, Effect, Layer, Ref } from "effect"
import { User, UserId } from "../domain/User.ts"
import { SearchQueryTooShort, UserNotFound, UsersError } from "../domain/UserErrors.ts"

export class Users extends Context.Service<Users, {
  list(search: string | undefined): Effect.Effect<Array<User>, UsersError>
  getById(id: UserId): Effect.Effect<User, UsersError>
  create(input: { readonly name: string; readonly email: string }): Effect.Effect<User, UsersError>
}>()("acme/Users") {
  static readonly layer = Layer.effect(
    Users,
    Effect.gen(function*() {
      const users = new Map<number, User>([
        [
          1,
          new User({
            id: UserId.make(1),
            name: "Admin",
            email: "admin@acme.dev"
          })
        ]
      ])
      const nextId = yield* Ref.make(2)

      const list = Effect.fn("UsersRepo.list")(function*(search: string | undefined) {
        const allUsers = Array.from(users.values())
        if (search === undefined || search.length === 0) {
          return allUsers
        } else if (search.length < SearchQueryTooShort.minimumLength) {
          return yield* new UsersError({
            reason: new SearchQueryTooShort()
          })
        }
        yield* Effect.annotateCurrentSpan({ search })
        const normalized = search.toLowerCase()
        return allUsers.filter((user) =>
          user.name.toLowerCase().includes(normalized) || user.email.toLowerCase().includes(normalized)
        )
      })

      const getById = Effect.fn("UsersRepo.getById")(function*(id: UserId) {
        yield* Effect.annotateCurrentSpan({ id })
        const user = users.get(id)
        if (user === undefined) {
          return yield* new UsersError({
            reason: new UserNotFound()
          })
        }
        return user
      })

      const create = Effect.fn("UsersRepo.create")(function*(input: { readonly name: string; readonly email: string }) {
        const id = yield* Ref.getAndUpdate(nextId, (current) => current + 1)
        const user = new User({ id: UserId.make(id), ...input })
        users.set(user.id, user)
        return user
      })

      return Users.of({ list, getById, create })
    })
  )
}
```
