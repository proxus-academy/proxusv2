> Adaptado del README de [`lucas-barake/effect-form`](https://github.com/lucas-barake/effect-form/tree/38791189f5154983d545222e5d3fbf091bb044f1) en el commit `38791189f5154983d545222e5d3fbf091bb044f1` (licencia MIT).
> Los imports usan los paquetes upstream fijados por el lockfile; sus tipos son la autoridad sobre la API exacta.

## 8. Auto-Submit Mode

```tsx
FormReact.make(formBuilder, {
  fields,
  mode: { validation: "onChange", debounce: "300 millis", autoSubmit: true },
  onSubmit
})

FormReact.make(formBuilder, {
  fields,
  mode: { validation: "onBlur", autoSubmit: true },
  onSubmit
})
```
