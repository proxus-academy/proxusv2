> Adaptado del README de [`lucas-barake/effect-form`](https://github.com/lucas-barake/effect-form/tree/38791189f5154983d545222e5d3fbf091bb044f1) en el commit `38791189f5154983d545222e5d3fbf091bb044f1` (licencia MIT).
> Los imports se ajustan a los paquetes locales de Proxus; la implementación local es la autoridad sobre su API exacta.

## 19. Validate on Provider

Validate persisted or pre-filled default values on mount. Useful when restoring form state from local storage:

```tsx
<form.Provider defaultValues={savedValues} validateOnInit>
  {children}
</form.Provider>
```

You can also trigger validation imperatively at any point:

```tsx
const triggerValidate = useAtomSet(form.validate)
triggerValidate()
```

Unlike `submit`, `validate` only runs schema validation and shows errors. It does not call `onSubmit`, bump `submitCount`, or store `lastSubmittedValues`.
