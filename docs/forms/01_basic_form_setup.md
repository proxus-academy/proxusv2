## 1. Basic Form Setup

Define comportamiento y atoms fuera del renderer:

```ts
import { Form, FormBuilder } from "@proxus/effect-form"

export const loginForm = Form.make(loginFormBuilder, {
  mode: { validation: "onSubmit" },
  onSubmit: (_: void, { decoded }) => login(decoded),
})
```

En web se crea un binding visual, sin repetir runtime, mode ni submit:

```tsx
import { FormReact } from "@proxus/effect-form/react"
import { TextField } from "@proxus/frontend-web/form"

export const LoginForm = FormReact.make(loginForm, {
  fields: { email: TextField, password: TextField },
})

<LoginForm.Provider defaultValues={{ email: "", password: "" }}>
  <LoginForm.Form>
    <LoginForm.email label="Email" type="email" />
    <LoginForm.password label="Password" type="password" />
    <LoginForm.Submit asChild><button>Login</button></LoginForm.Submit>
  </LoginForm.Form>
</LoginForm.Provider>
```

Los componentes de producto leen los atoms neutrales directamente:

```ts
const result = useAtomValue(loginForm.submit)
const reset = useAtomSet(loginForm.reset)
```

`Provider` ya no existe. `Provider` inicializa; `Form` posee el evento HTML; `Submit` puede estar dentro o fuera del elemento `<form>` mientras permanezca bajo el mismo provider.
