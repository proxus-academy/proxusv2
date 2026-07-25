> Adaptado del README de [`lucas-barake/effect-form`](https://github.com/lucas-barake/effect-form/tree/38791189f5154983d545222e5d3fbf091bb044f1) en el commit `38791189f5154983d545222e5d3fbf091bb044f1` (licencia MIT).
> Los imports se ajustan a los paquetes locales de Proxus; la implementación local es la autoridad sobre su API exacta.

## 9. Debounced Validation

```tsx
FormReact.make(formBuilder, {
  fields,
  mode: { validation: "onChange", debounce: "300 millis" },
  onSubmit
})
```
