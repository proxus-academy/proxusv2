> Adaptado del README de [`lucas-barake/effect-form`](https://github.com/lucas-barake/effect-form/tree/38791189f5154983d545222e5d3fbf091bb044f1) en el commit `38791189f5154983d545222e5d3fbf091bb044f1` (licencia MIT).
> Los imports usan los paquetes upstream fijados por el lockfile; sus tipos son la autoridad sobre la API exacta.

## 17. Reusable Field Definitions

For fields shared across multiple forms, use `Field.makeField` to define them once:

```tsx
import { Field, FormBuilder } from "@lucas-barake/effect-form"
import { FormReact } from "@lucas-barake/effect-form-react"

// Define reusable field
const EmailField = Field.makeField(
  "email",
  Schema.String.check(Schema.isPattern(/@/), Schema.isNonEmpty())
)

// Use in multiple forms
const loginForm = FormBuilder.empty
  .addField(EmailField)
  .addField("password", Schema.String)

const signupForm = FormBuilder.empty
  .addField(EmailField)
  .addField("password", Schema.String)
  .addField("name", Schema.String)

const newsletterForm = FormBuilder.empty
  .addField(EmailField)
```

You can also compose reusable field groups using `merge`:

```tsx
const addressFields = FormBuilder.empty
  .addField("street", Schema.String)
  .addField("city", Schema.String)
  .addField("zip", Schema.String)

const shippingForm = FormBuilder.empty
  .addField("name", Schema.String)
  .merge(addressFields)

const billingForm = FormBuilder.empty
  .addField("cardNumber", Schema.String)
  .merge(addressFields)
```
