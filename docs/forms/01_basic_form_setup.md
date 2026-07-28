## 1. Basic Form Setup

Define los campos y el schema fuera del renderer:

```ts
import { FormBuilder } from "@lucas-barake/effect-form"

export const loginFormBuilder = FormBuilder.empty
  .addField(EmailField)
  .addField(PasswordField)
```

En web se construyen el formulario y sus atoms:

```tsx
import { FormReact } from "@lucas-barake/effect-form-react"
import { TextField } from "../../platform/form/index.js"

export const LoginForm = FormReact.make(loginFormBuilder, {
  fields: { email: TextField, password: TextField },
  mode: { validation: "onSubmit" },
  onSubmit: (_: void, { decoded }) => login(decoded),
})

const submit = useAtomSet(LoginForm.submit)

<LoginForm.Initialize defaultValues={{ email: "", password: "" }}>
  <form onSubmit={(event) => {
    event.preventDefault()
    submit()
  }}>
    <LoginForm.email label="Email" type="email" />
    <LoginForm.password label="Password" type="password" />
    <button type="submit">Login</button>
  </form>
</LoginForm.Initialize>
```

Los componentes de producto leen los atoms de la instancia directamente:

```ts
const result = useAtomValue(LoginForm.submit)
const reset = useAtomSet(LoginForm.reset)
```
