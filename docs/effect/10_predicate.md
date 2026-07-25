> Portado de [`Effect-TS/effect/ai-docs/src/10_predicate`](https://github.com/Effect-TS/effect/tree/b49284193f86737e411dc3dd19cfb1a8b9fa5d95/ai-docs/src/10_predicate) en el commit `b49284193f86737e411dc3dd19cfb1a8b9fa5d95` (licencia MIT).
> Upstream usa Effect `4.0.0-beta.101`; Proxus usa `4.0.0-beta.98`. Verifica los tipos instalados antes de adoptar un ejemplo.


## Runtime type guards

The `Predicate` module contains small, reusable runtime checks.

**NEVER** write your own helper functions like `isRecord` or `isString`, instead
use the helpers from the `Predicate` module.

Predicates can be composed with apis such as `Predicate.and`,
`Predicate.or`, `Predicate.not`, and `Predicate.compose`.

## Using the Predicate module

Source: `10_predicate/01_basics.ts`.

```ts
/**
 * @title Using the Predicate module
 */
import { Predicate } from "effect"

const thing: unknown = {
  a: 1
}

if (Predicate.isObject(thing)) {
  if (Predicate.isNumber(thing.a)) {
    console.log("number", thing.a)
  }
}
```
