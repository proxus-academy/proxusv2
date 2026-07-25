> Adaptado del README de [`lucas-barake/effect-form`](https://github.com/lucas-barake/effect-form/tree/38791189f5154983d545222e5d3fbf091bb044f1) en el commit `38791189f5154983d545222e5d3fbf091bb044f1` (licencia MIT).
> Los imports se ajustan a los paquetes locales de Proxus; la implementación local es la autoridad sobre su API exacta.

## 13. Subscribing to Individual Field State

Use `getFieldAtoms` to subscribe to a specific field's value, error, dirty state, touched state, or validation status without re-rendering when other fields change.
The `value` atom returns `Option<T>` - `None` before initialization, `Some(value)` after:

```tsx
function EmailDisplay() {
  const emailAtoms = loginForm.getFieldAtoms(loginForm.fields.email)
  const emailOption = useAtomValue(emailAtoms.value)

  return Option.match(emailOption, {
    onNone: () => <span>Loading...</span>,
    onSome: (email) => <span>Current email: {email}</span>
  })
}

function PasswordStrength() {
  const passwordAtoms = loginForm.getFieldAtoms(loginForm.fields.password)
  const passwordOption = useAtomValue(passwordAtoms.value)

  const password = Option.getOrThrow(passwordOption)
  const strength = password.length < 8 ? "weak" : password.length < 12 ? "medium" : "strong"
  return <span>Password strength: {strength}</span>
}

function FieldStatus() {
  const nameAtoms = loginForm.getFieldAtoms(loginForm.fields.username)
  const isDirty = useAtomValue(nameAtoms.isDirty)
  const isTouched = useAtomValue(nameAtoms.isTouched)
  const isValidating = useAtomValue(nameAtoms.isValidating)
  const error = useAtomValue(nameAtoms.error)

  return (
    <div>
      {isDirty && <span>Modified</span>}
      {isTouched && <span>Touched</span>}
      {isValidating && <span>Validating...</span>}
      {Option.isSome(error) && <span>{error.value}</span>}
    </div>
  )
}
```
