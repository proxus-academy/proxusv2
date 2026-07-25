> Adaptado del README de [`lucas-barake/effect-form`](https://github.com/lucas-barake/effect-form/tree/38791189f5154983d545222e5d3fbf091bb044f1) en el commit `38791189f5154983d545222e5d3fbf091bb044f1` (licencia MIT).
> Los imports se ajustan a los paquetes locales de Proxus; la implementación local es la autoridad sobre su API exacta.

## 16. Reactivity (Query Invalidation)

Invalidate reactive queries (`AtomRpc`, `AtomHttpApi`, etc.) after successful form submission using `reactivityKeys`:

```tsx
import * as Atom from "effect/unstable/reactivity/Atom"

const userListAtom = runtime.atom(fetchUsers).pipe(
  Atom.withReactivity(["users"])
)

const createUserForm = FormReact.make(formBuilder, {
  runtime,
  fields: { name: TextInput, email: TextInput },
  reactivityKeys: ["users"],
  onSubmit: (_, { decoded }) => createUser(decoded)
})
```

After a successful submit, all atoms registered with matching keys will rebuild. Invalidation does **not** fire on validation failure or `onSubmit` effect failure.
