> Adaptado del README de [`lucas-barake/effect-form`](https://github.com/lucas-barake/effect-form/tree/38791189f5154983d545222e5d3fbf091bb044f1) en el commit `38791189f5154983d545222e5d3fbf091bb044f1` (licencia MIT).
> Los imports usan los paquetes upstream fijados por el lockfile; sus tipos son la autoridad sobre la API exacta.

## 4. Cross-Field Validation (Sync Refinements)

```tsx
const signupForm = FormBuilder.empty
  .addField("password", Schema.String)
  .addField("confirmPassword", Schema.String)
  .refine((values) => {
    if (values.password !== values.confirmPassword) {
      // Route error to specific field
      return { path: ["confirmPassword"], message: "Passwords must match" }
      // Or return root-level error (no path): return "Passwords must match"
    }
  })

// Display root-level errors with form.rootError
const rootError = useAtomValue(form.rootError)
Option.isSome(rootError) && <div className="error">{rootError.value}</div>
```
