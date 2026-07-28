> Adaptado del README de [`lucas-barake/effect-form`](https://github.com/lucas-barake/effect-form/tree/38791189f5154983d545222e5d3fbf091bb044f1) en el commit `38791189f5154983d545222e5d3fbf091bb044f1` (licencia MIT).
> Los imports usan los paquetes upstream fijados por el lockfile; sus tipos son la autoridad sobre la API exacta.

## Available Atoms

All forms expose these atoms for fine-grained subscriptions:

```ts
form.values // Atom<Option<EncodedValues>> - current form values
form.isDirty // Atom<boolean> - values differ from initial
form.hasChangedSinceSubmit // Atom<boolean> - values differ from last submit
form.lastSubmittedValues // Atom<Option<SubmittedValues>> - last submitted values
form.submitCount // Atom<number> - number of submit attempts
form.rootError // Atom<Option<string>> - root-level validation error (cross-field refinements without path)
form.submit // AtomResultFn<SubmitArgs, A, E | SchemaError> - submit with .waiting, ._tag
form.validate // AtomResultFn<void, void> - trigger schema validation without submitting
form.validationCount // Atom<number> - number of validate() calls
form.mount // Atom<void> - root anchor for state persistence (use with useAtomMount)

form.getFieldAtoms(fieldRef).value // Atom<Option<FieldValue>> - field value (None before init)
form.getFieldAtoms(fieldRef).error // Atom<Option<string>> - display error
form.getFieldAtoms(fieldRef).isDirty // Atom<boolean> - field dirty state
form.getFieldAtoms(fieldRef).isTouched // Atom<boolean> - field touched state
form.getFieldAtoms(fieldRef).isValidating // Atom<boolean> - field validation in progress
form.getFieldAtoms(fieldRef).setValue // Writable<void, T | (T => T)> - set field value
form.getFieldAtoms(fieldRef).setTouched // Writable<void, boolean> - set field touched
form.getFieldAtoms(fieldRef).validate // Writable<void, void> - trigger field validation and show error
```

> **Why `Option` for `values`?** Returns `None` before the form is initialized, `Some(values)` after. This allows parent components to safely subscribe and wait for initialization without throwing.
