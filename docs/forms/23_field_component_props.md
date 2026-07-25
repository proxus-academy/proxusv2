> Adaptado del README de [`lucas-barake/effect-form`](https://github.com/lucas-barake/effect-form/tree/38791189f5154983d545222e5d3fbf091bb044f1) en el commit `38791189f5154983d545222e5d3fbf091bb044f1` (licencia MIT).
> Los imports se ajustan a los paquetes locales de Proxus; la implementación local es la autoridad sobre su API exacta.

## Field Component Props Reference

```ts
interface FieldState<E,> {
  path: string // Dot-notation path identifying the field (e.g. "name", "items[0].street")
  value: E // Current field value (encoded type)
  onChange: (value: E) => void
  onBlur: () => void
  error: Option.Option<string> // Validation error (shown after touch/submit)
  isTouched: boolean // Field has been blurred
  isValidating: boolean // Async validation in progress
  isDirty: boolean // Value differs from initial
}

interface FieldComponentProps<E, P = {},> {
  field: FieldState<E> // Form-controlled state
  props: P // Custom props passed at render time
}

// Helper type for defining field components
type FieldComponent<T, P = {},> = React.FC<FieldComponentProps<FieldValue<T>, P>>
```

### Defining Field Components

Use `FieldComponent<T>` to define reusable field components. You can pass either:

- A value type directly: `FieldComponent<string>`
- A Schema type: `FieldComponent<typeof Schema.String>` (extracts the encoded type)

```tsx
// With value type (recommended)
const TextInput: FormReact.FieldComponent<string> = ({ field }) => (
  <input
    value={field.value}
    onChange={(e) => field.onChange(e.target.value)}
    onBlur={field.onBlur}
  />
)

// With Schema type
const TextInput: FormReact.FieldComponent<typeof Schema.String> = ({ field }) => (
  <input
    value={field.value}
    onChange={(e) => field.onChange(e.target.value)}
    onBlur={field.onBlur}
  />
)

// With custom props
const TextInput: FormReact.FieldComponent<string, { placeholder?: string }> = ({ field, props }) => (
  <input
    value={field.value}
    onChange={(e) => field.onChange(e.target.value)}
    placeholder={props.placeholder}
  />
)

// Pass props at render time
<LoginForm.email placeholder="Enter email" />
```

Components typed with value types can be reused across schemas with the same encoded type:

```tsx
const TextInput: FormReact.FieldComponent<string> = ({ field }) => (
  <input
    value={field.value}
    onChange={(e) => field.onChange(e.target.value)}
  />
)

const form = Form.make(formBuilder, { onSubmit })
const FormView = FormReact.make(form, {
  fields: {
    name: TextInput,
    age: TextInput
  }
})
```
