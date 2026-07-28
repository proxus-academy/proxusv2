> Adaptado del README de [`lucas-barake/effect-form`](https://github.com/lucas-barake/effect-form/tree/38791189f5154983d545222e5d3fbf091bb044f1) en el commit `38791189f5154983d545222e5d3fbf091bb044f1` (licencia MIT).
> Los imports usan los paquetes upstream fijados por el lockfile; sus tipos son la autoridad sobre la API exacta.

## 19. Validate on Initialize

Validate persisted or pre-filled default values on mount. Useful when restoring form state from local storage:

```tsx
<form.Initialize defaultValues={savedValues} validateOnInit>
  {children}
</form.Initialize>
```

You can also trigger validation imperatively at any point:

```tsx
const triggerValidate = useAtomSet(form.validate)
triggerValidate()
```

Unlike `submit`, `validate` only runs schema validation and shows errors. It does not call `onSubmit`, bump `submitCount`, or store `lastSubmittedValues`.
