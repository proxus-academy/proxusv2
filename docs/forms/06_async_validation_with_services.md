> Adaptado del README de [`lucas-barake/effect-form`](https://github.com/lucas-barake/effect-form/tree/38791189f5154983d545222e5d3fbf091bb044f1) en el commit `38791189f5154983d545222e5d3fbf091bb044f1` (licencia MIT).
> Los imports usan los paquetes upstream fijados por el lockfile; sus tipos son la autoridad sobre la API exacta.

## 6. Async Validation with Services

```tsx
import * as Context from "effect/Context"

class UsernameValidator extends Context.Tag("UsernameValidator")<
  UsernameValidator,
  { readonly isTaken: (username: string) => Effect.Effect<boolean> }
>() {}

const UsernameValidatorLive = Layer.succeed(UsernameValidator, {
  isTaken: (username) =>
    Effect.gen(function*() {
      yield* Effect.sleep("100 millis")
      return username === "taken"
    })
})

const runtime = Atom.runtime(UsernameValidatorLive)

const signupFormBuilder = FormBuilder.empty
  .addField("username", Schema.String)
  .refineEffect((values) =>
    Effect.gen(function*() {
      const validator = yield* UsernameValidator
      const isTaken = yield* validator.isTaken(values.username)
      if (isTaken) {
        return { path: ["username"], message: "Username is already taken" }
      }
    })
  )

const signupForm = FormReact.make(signupFormBuilder, {
  runtime,
  fields: { username: UsernameInput },
  onSubmit: (_, { decoded }) => Effect.log(`Signup: ${decoded.username}`)
})
```
