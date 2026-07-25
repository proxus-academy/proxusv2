> Portado de [`Effect-TS/effect/ai-docs/src/01_effect/04_errors`](https://github.com/Effect-TS/effect/tree/b49284193f86737e411dc3dd19cfb1a8b9fa5d95/ai-docs/src/01_effect/04_errors) en el commit `b49284193f86737e411dc3dd19cfb1a8b9fa5d95` (licencia MIT).
> Upstream usa Effect `4.0.0-beta.101`; Proxus usa `4.0.0-beta.98`. Verifica los tipos instalados antes de adoptar un ejemplo.


## Error handling

## Error handling basics

Source: `01_effect/04_errors/01_error-handling.ts`.

```ts
/**
 * @title Error handling basics
 *
 * Defining custom errors and handling them with Effect.catch and Effect.catchTag.
 */
import { Effect, Schema } from "effect"

// Define custom errors using Schema.TaggedErrorClass
export class ParseError extends Schema.TaggedErrorClass<ParseError>()("ParseError", {
  input: Schema.String,
  message: Schema.String
}) {}

export class ReservedPortError extends Schema.TaggedErrorClass<ReservedPortError>()("ReservedPortError", {
  port: Schema.Number
}) {}

declare const loadPort: (input: string) => Effect.Effect<number, ParseError | ReservedPortError>

export const recovered = loadPort("80").pipe(
  // Catch multiple errors with Effect.catchTag, and return a default port number.
  Effect.catchTag(["ParseError", "ReservedPortError"], (_) => Effect.succeed(3000))
)

export const withFinalFallback = loadPort("invalid").pipe(
  // Catch a specific error with Effect.catchTag
  Effect.catchTag("ReservedPortError", (_) => Effect.succeed(3000)),
  // Catch all errors with Effect.catch
  Effect.catch((_) => Effect.succeed(3000))
)
```

## Catch multiple errors with Effect.catchTags

Source: `01_effect/04_errors/10_catch-tags.ts`.

```ts
/**
 * @title Catch multiple errors with Effect.catchTags
 *
 * Use `Effect.catchTags` to handle several tagged errors in one place.
 */

import { Effect, Schema } from "effect"

export class ValidationError extends Schema.TaggedErrorClass<ValidationError>()("ValidationError", {
  message: Schema.String
}) {}

export class NetworkError extends Schema.TaggedErrorClass<NetworkError>()("NetworkError", {
  statusCode: Schema.Number
}) {}

declare const fetchUser: (id: string) => Effect.Effect<string, ValidationError | NetworkError>

export const userOrFallback = fetchUser("123").pipe(
  Effect.catchTags({
    ValidationError: (error) => Effect.succeed(`Validation failed: ${error.message}`),
    NetworkError: (error) => Effect.succeed(`Network request failed with status ${error.statusCode}`)
  })
)
```

## Creating and handling errors with reasons

Source: `01_effect/04_errors/20_reason-errors.ts`.

```ts
/**
 * @title Creating and handling errors with reasons
 *
 * Define a tagged error with a tagged `reason` field, then recover with
 * `Effect.catchReason`, `Effect.catchReasons`, or by unwrapping the reason into
 * the error channel with `Effect.unwrapReason`.
 */

import { Effect, Schema } from "effect"

export class RateLimitError extends Schema.TaggedErrorClass<RateLimitError>()("RateLimitError", {
  retryAfter: Schema.Number
}) {}

export class QuotaExceededError extends Schema.TaggedErrorClass<QuotaExceededError>()("QuotaExceededError", {
  limit: Schema.Number
}) {}

export class SafetyBlockedError extends Schema.TaggedErrorClass<SafetyBlockedError>()("SafetyBlockedError", {
  category: Schema.String
}) {}

export class AiError extends Schema.TaggedErrorClass<AiError>()("AiError", {
  reason: Schema.Union([RateLimitError, QuotaExceededError, SafetyBlockedError])
}) {}

declare const callModel: Effect.Effect<string, AiError>

export const handleOneReason = callModel.pipe(
  // Use `Effect.catchReason` to handle a specific reason type
  Effect.catchReason(
    "AiError", // The parent error _tag to catch
    "RateLimitError", // The reason _tag to catch
    // The handler for the caught reason
    (reason) => Effect.succeed(`Retry after ${reason.retryAfter} seconds`),
    // Optionally handle all the other reasons with a catch-all handler
    (reason) => Effect.succeed(`Model call failed for reason: ${reason._tag}`)
  )
)

export const handleMultipleReasons = callModel.pipe(
  // Use `Effect.catchReasons` to handle multiple reason types for a given error
  // in one go
  Effect.catchReasons(
    "AiError",
    {
      RateLimitError: (reason) => Effect.succeed(`Retry after ${reason.retryAfter} seconds`),
      QuotaExceededError: (reason) => Effect.succeed(`Quota exceeded at ${reason.limit} tokens`)
    }
    // Optionally handle all the other reasons with a catch-all handler
    // (reason) => Effect.succeed(`Unhandled reason: ${reason._tag}`)
  )
)

export const unwrapAndHandle = callModel.pipe(
  // Use `Effect.unwrapReason` to move the reasons into the error channel, then
  // handle them all with `Effect.catchTags` or other error handling combinators
  Effect.unwrapReason("AiError"),
  Effect.catchTags({
    RateLimitError: (reason) => Effect.succeed(`Back off for ${reason.retryAfter} seconds`),
    QuotaExceededError: (reason) => Effect.succeed(`Increase quota beyond ${reason.limit}`),
    SafetyBlockedError: (reason) => Effect.succeed(`Blocked by safety category: ${reason.category}`)
  })
)
```
