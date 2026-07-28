> Adaptado del README de [`lucas-barake/effect-form`](https://github.com/lucas-barake/effect-form/tree/38791189f5154983d545222e5d3fbf091bb044f1) en el commit `38791189f5154983d545222e5d3fbf091bb044f1` (licencia MIT).
> Los imports usan los paquetes upstream fijados por el lockfile; sus tipos son la autoridad sobre la API exacta.

## 10. isDirty Tracking

```tsx
function FormStatus() {
  const isDirty = useAtomValue(loginForm.isDirty)
  const reset = useAtomSet(loginForm.reset)

  return (
    <>
      {isDirty && <span>You have unsaved changes</span>}
      <button onClick={() => reset()} disabled={!isDirty}>
        Reset
      </button>
    </>
  )
}

const EmailInput: FormReact.FieldComponent<string> = ({ field }) => (
  <div>
    <input
      value={field.value}
      onChange={(e) => field.onChange(e.target.value)}
      onBlur={field.onBlur}
    />
    {field.isDirty && <span>*</span>}
  </div>
)
```
