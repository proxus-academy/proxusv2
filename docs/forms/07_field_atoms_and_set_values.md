> Adaptado del README de [`lucas-barake/effect-form`](https://github.com/lucas-barake/effect-form/tree/38791189f5154983d545222e5d3fbf091bb044f1) en el commit `38791189f5154983d545222e5d3fbf091bb044f1` (licencia MIT).
> Los imports se ajustan a los paquetes locales de Proxus; la implementación local es la autoridad sobre su API exacta.

## 7. getFieldAtoms and setValues

`getFieldAtoms` returns a bundle of safe per-field atoms. Use `useAtomSet` to call operations:

```tsx
function FormControls() {
  const emailAtoms = loginForm.getFieldAtoms(loginForm.fields.email)
  const passwordAtoms = loginForm.getFieldAtoms(loginForm.fields.password)

  const setEmail = useAtomSet(emailAtoms.setValue)
  const setPassword = useAtomSet(passwordAtoms.setValue)
  const setAllValues = useAtomSet(loginForm.setValues)

  return (
    <>
      <button onClick={() => setEmail("new@email.com")}>
        Set Email
      </button>

      <button onClick={() => setPassword((prev) => prev.toUpperCase())}>
        Uppercase Password
      </button>

      <button onClick={() => setAllValues({ email: "reset@email.com", password: "" })}>
        Reset to Defaults
      </button>
    </>
  )
}
```

> `setValues` is an `Atom.Writable` — you can also use `registry.update` from Atom's context for type-safe updater callbacks: `registry.update(form.setValues, (prev) => ({ ...prev, email: "new" }))`.
