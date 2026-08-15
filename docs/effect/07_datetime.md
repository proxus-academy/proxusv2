> Portado de [`Effect-TS/effect/ai-docs/src/07_datetime`](https://github.com/Effect-TS/effect/tree/b49284193f86737e411dc3dd19cfb1a8b9fa5d95/ai-docs/src/07_datetime) en el commit `b49284193f86737e411dc3dd19cfb1a8b9fa5d95` (licencia MIT).
> Upstream usa Effect `4.0.0-beta.101`; Proxus usa `4.0.0-beta.100`. Verifica los tipos instalados antes de adoptar un ejemplo.


## Working with DateTime

When working with dates and time, use the `DateTime` module instead of `Date` and `Date.now`.

Use it when your Effect programs need testable current time, safe parsing, stable ISO formatting, time-zone conversion, or calendar arithmetic.

## Creating and formatting DateTime values

Source: `07_datetime/10_creating-and-formatting.ts`.

```ts
/**
 * @title Creating and formatting DateTime values
 *
 * Parse incoming date values safely, use Clock-powered current time, and format
 * instants for API payloads or user-facing labels.
 */
import { DateTime, Effect, Option } from "effect"

Effect.gen(function*() {
  // Use DateTime.now to get the current time from Effect's Clock service.
  // Using the Clock service ensures tests can use the `TestClock` module to
  // control time.
  const now = yield* DateTime.now

  // Use DateTime.make to parse a date input, such as a user-entered string or a
  // epoch timestamp. It returns an Option depending on whether the input was
  // valid.
  const parsedOption: Option.Option<DateTime.Utc> = DateTime.make("2024-06-15T14:30:00.000Z")

  // you can then use the Option apis to unwrap the value
  Option.getOrUndefined(parsedOption)

  // Calendar/date-time math returns a new DateTime value; the original value is
  // immutable.
  const endsAt = now.pipe(DateTime.add({ hours: 2 }))

  // The DateTime.format* functions can be used to convert a DateTime value to
  // differen formats.
  yield* Effect.log("ISO string:", DateTime.formatIso(endsAt))
})
```

## Working with time zones

Source: `07_datetime/20_time-zones.ts`.

```ts
/**
 * @title Working with time zones
 *
 * Attach IANA zones to instants, render zoned ISO strings, and provide a
 * CurrentTimeZone service for code that should use the workspace/user zone.
 */
import { NodeRuntime } from "@effect/platform-node"
import { DateTime, Effect, Option } from "effect"

Effect.gen(function*() {
  // Use DateTime.now to get the current time from Effect's Clock service.
  const now = yield* DateTime.now

  // To attach a named IANA zone to a DateTime value
  const nowInAuckland = now.pipe(
    // Use DateTime.setZoneNamedUnsafe when you know the zone is valid.
    DateTime.setZoneNamedUnsafe("Pacific/Auckland")
  )
  yield* Effect.log("Now in Auckland:", nowInAuckland)

  // Use DateTime.setZoneNamed when you don't know the zone is valid.
  const nowInSydneyOption: Option.Option<DateTime.Zoned> = now.pipe(
    DateTime.setZoneNamed("Australia/Sydney")
  )

  yield* Effect.log("Now in Sydney:", Option.getOrUndefined(nowInSydneyOption))

  // To generate a `DateTime.Zoned` in the `DateTime.CurrentTimeZone`
  const nowInNewYork = yield* DateTime.nowInCurrentZone
  yield* Effect.log("Now in New York:", nowInNewYork)

  // If you have a date string that you know is in a particular IANA zone, you
  // can convert it to a DateTime.Zoned to ensure the instant is correct
  const dateInAuckland: DateTime.Zoned = DateTime.makeZonedUnsafe("2026-06-05", {
    timeZone: "Pacific/Auckland",
    // adjustForTimeZone will adjust the input to the given zone, otherwise it
    // will be treated as UTC.
    adjustForTimeZone: true
  })
  yield* Effect.log("Date in Auckland:", dateInAuckland)
}).pipe(
  Effect.provide(DateTime.layerCurrentZoneNamed("America/New_York")),
  NodeRuntime.runMain
)
```
