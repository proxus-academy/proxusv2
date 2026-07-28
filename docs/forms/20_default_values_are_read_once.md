> Adaptado del README de [`lucas-barake/effect-form`](https://github.com/lucas-barake/effect-form/tree/38791189f5154983d545222e5d3fbf091bb044f1) en el commit `38791189f5154983d545222e5d3fbf091bb044f1` (licencia MIT).
> Los imports usan los paquetes upstream fijados por el lockfile; sus tipos son la autoridad sobre la API exacta.

## 20. defaultValues Are Read Once

`Initialize` reads `defaultValues` on mount only — changing the prop on a mounted form is intentionally ignored (your users' in-progress edits are never clobbered by a re-render). To load new values into a live form, write them with `form.setValues`; to fully re-initialize (new initial values, cleared dirty/touched/submit state), remount `Initialize` with a `key`:

```tsx
// Update values in place — dirty tracking still compares against the original defaults
const setValues = useAtomSet(form.setValues)
setValues(fetchedUser)

// Re-initialize from scratch when the underlying entity changes
<form.Initialize key={userId} defaultValues={userValues}>
  {children}
</form.Initialize>
```

> Remounting re-initializes because form state is disposed when `Initialize` unmounts — unless a `KeepAlive` is mounted (section 18), in which case the existing state survives and `defaultValues` is ignored on the next mount.
