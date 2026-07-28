> Adaptado del README de [`lucas-barake/effect-form`](https://github.com/lucas-barake/effect-form/tree/38791189f5154983d545222e5d3fbf091bb044f1) en el commit `38791189f5154983d545222e5d3fbf091bb044f1` (licencia MIT).
> Los imports usan los paquetes upstream fijados por el lockfile; sus tipos son la autoridad sobre la API exacta.

## 18. Persisting State Across Unmounts (KeepAlive)

By default, form state is destroyed when `Initialize` unmounts. For multi-step wizards or conditional fields where you want state to persist, use `KeepAlive`:

```tsx
function MultiStepWizard() {
  const [step, setStep] = useState(1)

  return (
    <div>
      {/* Keep form state alive even when steps unmount */}
      <step1Form.KeepAlive />
      <step2Form.KeepAlive />

      {step === 1 && <Step1 onNext={() => setStep(2)} />}
      {step === 2 && <Step2 onBack={() => setStep(1)} />}
    </div>
  )
}

function Step1({ onNext }: { onNext: () => void }) {
  return (
    <step1Form.Initialize defaultValues={{ name: "" }}>
      <step1Form.name />
      <button onClick={onNext}>Next</button>
    </step1Form.Initialize>
  )
}
```

Without `KeepAlive`, navigating from Step1 to Step2 and back would lose all Step1 data. With `KeepAlive` at the wizard root, state persists across step changes.

**When to use:**

- Multi-step wizards where steps unmount
- Conditional fields (toggles between optional inputs)
- Tab-based forms where inactive tabs unmount

**Alternative: Hook-based mounting**

For more control, use `useAtomMount` with the `mount` atom directly:

```tsx
import { useAtomMount } from "@effect/atom-react"

function Wizard() {
  useAtomMount(step1Form.mount)
  useAtomMount(step2Form.mount)
  // ...
}
```
