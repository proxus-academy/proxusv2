> Portado de [`Effect-TS/effect/ai-docs/src/01_effect/03_services`](https://github.com/Effect-TS/effect/tree/b49284193f86737e411dc3dd19cfb1a8b9fa5d95/ai-docs/src/01_effect/03_services) en el commit `b49284193f86737e411dc3dd19cfb1a8b9fa5d95` (licencia MIT).
> Upstream usa Effect `4.0.0-beta.101`; Proxus usa `4.0.0-beta.100`. Verifica los tipos instalados antes de adoptar un ejemplo.


## Writing Effect services

Effect services are the most common way to structure Effect code. Prefer using
services to encapsulate behaviour over other approaches, as it ensures that your
code is modular, testable, and maintainable.

## Context.Service

Source: `01_effect/03_services/01_service.ts`.

```ts
/**
 * @title Context.Service
 *
 * The default way to define a service is to extend `Context.Service`,
 * passing in the service interface as a type parameter.
 */

// file: src/db/Database.ts
import { Context, Effect, Layer, Schema } from "effect"

// Pass in the service class name as the first type parameter, and the service
// interface as the second type parameter.
export class Database extends Context.Service<Database, {
  query(sql: string): Effect.Effect<Array<unknown>, DatabaseError>
}>()(
  // The string identifier for the service, which should include the package
  // name and the subdirectory path to the service file.
  "myapp/db/Database"
) {
  // Attach a static layer to the service, which will be used to provide an
  // implementation of the service.
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function*() {
      // Define the service methods using Effect.fn
      const query = Effect.fn("Database.query")(function*(sql: string) {
        yield* Effect.log("Executing SQL query:", sql)
        return [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]
      })

      // Return an instance of the service using Database.of, passing in an
      // object that implements the service interface.
      return Database.of({
        query
      })
    })
  )
}

export class DatabaseError extends Schema.TaggedErrorClass<DatabaseError>()("DatabaseError", {
  cause: Schema.Defect()
}) {}

// If you ever need to access the service type, use `Database["Service"]`
export type DatabaseService = Database["Service"]
```

## Context.Reference

Source: `01_effect/03_services/10_reference.ts`.

```ts
/**
 * @title Context.Reference
 *
 * For defining configuration values, feature flags, or any other service that has a default value.
 */
import { Context } from "effect"

export const FeatureFlag = Context.Reference<boolean>("myapp/FeatureFlag", {
  defaultValue: () => false
})
```

## Composing services with the Layer module

Source: `01_effect/03_services/20_layer-composition.ts`.

```ts
/**
 * @title Composing services with the Layer module
 *
 * Build focused service layers, then compose them with `Layer.provide` and
 * `Layer.provideMerge` based on what services you want to expose.
 */

import { PgClient } from "@effect/sql-pg"
import { Array, Config, Context, Effect, Layer, type Option, Schema } from "effect"
import { SqlClient, SqlError } from "effect/unstable/sql"

// Define a layer for the SqlClient service
export const SqlClientLayer: Layer.Layer<
  PgClient.PgClient | SqlClient.SqlClient,
  Config.ConfigError | SqlError.SqlError
> = PgClient.layerConfig({
  url: Config.redacted("DATABASE_URL")
})

export class UserRespositoryError extends Schema.TaggedErrorClass<UserRespositoryError>()("UserRespositoryError", {
  reason: SqlError.SqlError
}) {}

export class UserRepository extends Context.Service<UserRepository, {
  findById(id: string): Effect.Effect<
    Option.Option<{ readonly id: string; readonly name: string }>,
    UserRespositoryError
  >
}>()("myapp/UserRepository") {
  // Implement the layer for the UserRepository service, which depends on the
  // SqlClient service
  static readonly layerNoDeps: Layer.Layer<
    UserRepository,
    never,
    SqlClient.SqlClient
  > = Layer.effect(
    UserRepository,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient

      const findById = Effect.fn("UserRepository.findById")(function*(id: string) {
        const results = yield* sql<{
          readonly id: string
          readonly name: string
        }>`SELECT * FROM users WHERE id = '${id}'`
        return Array.head(results)
      }, Effect.mapError((reason) => new UserRespositoryError({ reason })))

      return UserRepository.of({ findById })
    })
  )

  // Use Layer.provide to compose the UserRepository layer with the SqlClient
  // layer, exposing only the UserRepository service
  static readonly layer: Layer.Layer<
    UserRepository,
    Config.ConfigError | SqlError.SqlError
  > = this.layerNoDeps.pipe(
    Layer.provide(SqlClientLayer)
  )

  // Use Layer.provideMerge to compose the UserRepository layer with the SqlClient
  // layer, exposing both the UserRepository and SqlClient services
  static readonly layerWithSqlClient: Layer.Layer<
    UserRepository | SqlClient.SqlClient,
    Config.ConfigError | SqlError.SqlError
  > = this.layerNoDeps.pipe(
    Layer.provideMerge(SqlClientLayer)
  )
}
```

## Creating Layers from configuration and/or Effects

Source: `01_effect/03_services/20_layer-unwrap.ts`.

```ts
/**
 * @title Creating Layers from configuration and/or Effects
 *
 * Build a layer dynamically from an Effect / Config with `Layer.unwrap`.
 */
import { Config, Context, Effect, Layer, Schema } from "effect"

export class MessageStoreError extends Schema.TaggedErrorClass<MessageStoreError>()("MessageStoreError", {
  cause: Schema.Defect()
}) {}

export class MessageStore extends Context.Service<MessageStore, {
  append(message: string): Effect.Effect<void>
  readonly all: Effect.Effect<ReadonlyArray<string>>
}>()("myapp/MessageStore") {
  static readonly layerInMemory = Layer.effect(
    MessageStore,
    Effect.sync(() => {
      const messages: Array<string> = []

      return MessageStore.of({
        append: (message) =>
          Effect.sync(() => {
            messages.push(message)
          }),
        all: Effect.sync(() => [...messages])
      })
    })
  )

  static readonly layerRemote = (url: URL) =>
    Layer.effect(
      MessageStore,
      Effect.try({
        try: () => {
          // In a real app this is where you would open a network connection.
          const messages: Array<string> = []

          return MessageStore.of({
            append: (message) =>
              Effect.sync(() => {
                messages.push(`[${url.host}] ${message}`)
              }),
            all: Effect.sync(() => [...messages])
          })
        },
        catch: (cause) => new MessageStoreError({ cause })
      })
    )

  static readonly layer = Layer.unwrap(
    Effect.gen(function*() {
      // Read config inside an Effect, then choose which concrete layer to use.
      const useInMemory = yield* Config.boolean("MESSAGE_STORE_IN_MEMORY").pipe(
        Config.withDefault(false)
      )

      if (useInMemory) {
        return MessageStore.layerInMemory
      }

      const remoteUrl = yield* Config.url("MESSAGE_STORE_URL")
      return MessageStore.layerRemote(remoteUrl)
    })
  )
}
```
