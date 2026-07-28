> Adaptado del README de [`lucas-barake/effect-form`](https://github.com/lucas-barake/effect-form/tree/38791189f5154983d545222e5d3fbf091bb044f1) en el commit `38791189f5154983d545222e5d3fbf091bb044f1` (licencia MIT).
> Los imports usan los paquetes upstream fijados por el lockfile; sus tipos son la autoridad sobre la API exacta.

## Available Operations

Operations are AtomResultFns - use `useAtomSet` to invoke:

```ts
form.reset // AtomResultFn<void> - reset to initial values
form.revertToLastSubmit // AtomResultFn<void> - revert to last submit
form.setValues // Writable<Values> - set all values (supports updater via registry.update)
form.submit // AtomResultFn<void, A, E> - trigger submit (handler defined at build)
form.validate // AtomResultFn<void> - trigger full schema validation without submitting
```
