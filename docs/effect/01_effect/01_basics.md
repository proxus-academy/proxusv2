> Portado de [`Effect-TS/effect/ai-docs/src/01_effect/01_basics`](https://github.com/Effect-TS/effect/tree/b49284193f86737e411dc3dd19cfb1a8b9fa5d95/ai-docs/src/01_effect/01_basics) en el commit `b49284193f86737e411dc3dd19cfb1a8b9fa5d95` (licencia MIT).
> Upstream usa Effect `4.0.0-beta.101`; Proxus usa `4.0.0-beta.100`. Verifica los tipos instalados antes de adoptar un ejemplo.


## Writing `Effect` code

Prefer writing Effect code with `Effect.gen` & `Effect.fn("name")`. Then attach
additional behaviour with combinators. This style is more readable and easier to
maintain than using combinators alone.

## Using Effect.gen

Source: `01_effect/01_basics/01_effect-gen.ts`.

```ts
/**
 * @title Using Effect.gen
 *
 * Use `Effect.gen` to write code in an imperative style similar to async await.
 * You can use `yield*` to access the result of an effect.
 */

import { Effect, Schema } from "effect"

Effect.gen(function*() {
  yield* Effect.log("Starting the file processing...")
  yield* Effect.log("Reading file...")

  // Always return when raising an error, to ensure typescript understands that
  // the function will not continue executing.
  return yield* new FileProcessingError({ message: "Failed to read the file" })
}).pipe(
  // Add additional functionality with .pipe
  Effect.catch((error) => Effect.logError(`An error occurred: ${error}`)),
  Effect.withSpan("fileProcessing", {
    attributes: {
      method: "Effect.gen"
    }
  })
)

// Use Schema.TaggedErrorClass to define a custom error
export class FileProcessingError extends Schema.TaggedErrorClass<FileProcessingError>()("FileProcessingError", {
  message: Schema.String
}) {}
```

## Using Effect.fn

Source: `01_effect/01_basics/02_effect-fn.ts`.

```ts
/**
 * @title Using Effect.fn
 *
 * When writing functions that return an Effect, use `Effect.fn` to use the
 * generator syntax.
 *
 * **Avoid creating functions that return an Effect.gen**, use `Effect.fn`
 * instead.
 */

import { Effect, Schema } from "effect"

// Pass a string to Effect.fn, which will improve stack traces and also
// attach a tracing span (using Effect.withSpan behind the scenes).
//
// The name string should match the function name.
//
export const effectFunction = Effect.fn("effectFunction")(
  // You can use `Effect.fn.Return` to specify the return type of the function.
  // It accepts the same type parameters as `Effect.Effect`.
  function*(n: number): Effect.fn.Return<string, SomeError> {
    yield* Effect.logInfo("Received number:", n)

    // Always return when raising an error, to ensure typescript understands that
    // the function will not continue executing.
    return yield* new SomeError({ message: "Failed to read the file" })
  },
  // Add additional functionality by passing in additional arguments.
  // **Do not** use .pipe with Effect.fn
  Effect.catch((error) => Effect.logError(`An error occurred: ${error}`)),
  Effect.annotateLogs({
    method: "effectFunction"
  })
)

// Use Schema.TaggedErrorClass to define a custom error
export class SomeError extends Schema.TaggedErrorClass<SomeError>()("SomeError", {
  message: Schema.String
}) {}
```

## Creating effects from common sources

Source: `01_effect/01_basics/10_creating-effects.ts`.

```ts
/**
 * @title Creating effects from common sources
 *
 * Learn how to create effects from various sources, including plain values,
 * synchronous code, Promise APIs, optional values, and callback-based APIs.
 */
import { Effect, Schema } from "effect"

class InvalidPayload extends Schema.TaggedErrorClass<InvalidPayload>()("InvalidPayload", {
  input: Schema.String,
  cause: Schema.Defect()
}) {}

class UserLookupError extends Schema.TaggedErrorClass<UserLookupError>()("UserLookupError", {
  userId: Schema.Number,
  cause: Schema.Defect()
}) {}

class MissingWorkspaceId extends Schema.TaggedErrorClass<MissingWorkspaceId>()("MissingWorkspaceId", {}) {}

// Some request fields are optional and may be absent.
const requestHeaders = new Map<string, string>([
  ["x-request-id", "req_1"]
])

// `Effect.succeed` wraps values you already have in memory.
export const fromValue = Effect.succeed({ env: "prod", retries: 3 })

// `Effect.sync` wraps synchronous side effects that should not throw.
export const fromSyncSideEffect = Effect.sync(() => Date.now())

// `Effect.try` wraps synchronous code that may throw.
export const parsePayload = Effect.fn("parsePayload")((input: string) =>
  Effect.try({
    try: () => JSON.parse(input) as { readonly userId: number },
    catch: (cause) => new InvalidPayload({ input, cause })
  })
)

const users = new Map<number, { readonly id: number; readonly name: string }>([
  [1, { id: 1, name: "Ada" }],
  [2, { id: 2, name: "Lin" }]
])

// `Effect.tryPromise` wraps Promise-based APIs that can reject or throw.
export const fetchUser = Effect.fn("fetchUser")((userId: number) =>
  Effect.tryPromise({
    async try() {
      const user = users.get(userId)
      if (!user) {
        throw new Error(`Missing user ${userId}`)
      }
      return user
    },
    catch: (cause) => new UserLookupError({ userId, cause })
  })
)

// `Effect.fromNullishOr` turns nullable values into a typed effect.
export const fromNullishHeader = Effect.fromNullishOr(requestHeaders.get("x-workspace-id")).pipe(
  Effect.mapError(() => new MissingWorkspaceId())
)

// `Effect.callback` wraps callback-style asynchronous APIs.
export const fromCallback = Effect.callback<number>((resume) => {
  const timeoutId = setTimeout(() => {
    resume(Effect.succeed(200))
  }, 10)

  // Return a finalizer so interruption can cancel the callback source.
  return Effect.sync(() => {
    clearTimeout(timeoutId)
  })
})
```
