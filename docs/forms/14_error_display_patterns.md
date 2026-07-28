> Adaptado del README de [`lucas-barake/effect-form`](https://github.com/lucas-barake/effect-form/tree/38791189f5154983d545222e5d3fbf091bb044f1) en el commit `38791189f5154983d545222e5d3fbf091bb044f1` (licencia MIT).
> Los imports usan los paquetes upstream fijados por el lockfile; sus tipos son la autoridad sobre la API exacta.

## 14. Error Display Patterns

```tsx
const TextInput: FormReact.FieldComponent<string> = ({ field }) => (
  <div>
    <input
      value={field.value}
      onChange={(e) => field.onChange(e.target.value)}
      onBlur={field.onBlur}
    />
    {field.isValidating && <span>Validating...</span>}
    {Option.isSome(field.error) && <span className="error">{field.error.value}</span>}
  </div>
)

import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"

function SubmitStatus() {
  const submitResult = useAtomValue(loginForm.submit)

  if (submitResult.waiting) return <span>Submitting...</span>
  if (AsyncResult.isSuccess(submitResult)) return <span>Success!</span>
  if (AsyncResult.isFailure(submitResult)) return <span>Failed</span>
  return null
}

// For side effects after submit (navigation, close dialog, etc.):
function FormWithSideEffects({ onClose }: { onClose: () => void }) {
  useAtomSubscribe(
    loginForm.submit,
    (result) => {
      if (AsyncResult.isSuccess(result)) {
        onClose()
      }
    },
    { immediate: false }
  )

  return <loginForm.Initialize defaultValues={{ email: "", password: "" }}>...</loginForm.Initialize>
}
```
