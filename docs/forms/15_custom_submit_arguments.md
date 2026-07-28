## 15. Custom Submit Arguments

El argumento se declara al construir la instancia React:

```ts
const ContactForm = FormReact.make(contactFormBuilder, {
  runtime,
  fields: { email: TextField, message: TextField },
  onSubmit: (args: { source: string }, { decoded }) =>
    Effect.log(`Contact from ${args.source}: ${decoded.email}`),
})
```

Al enviar, la pantalla pasa el argumento al setter del atom:

```tsx
const submit = useAtomSet(ContactForm.submit)

<ContactForm.Initialize defaultValues={defaults}>
  <form onSubmit={(event) => {
    event.preventDefault()
    submit({
      source: event.nativeEvent.submitter?.getAttribute("data-source") ?? "page",
    })
  }}>
    {/* fields */}
    <button type="submit" data-source="page">Send</button>
  </form>
</ContactForm.Initialize>
```

Para acciones programáticas se escribe directamente en el atom:

```ts
const submit = useAtomSet(ContactForm.submit)
submit({ source: "shortcut" })
```

Auto-submit solo está disponible cuando `SubmitArgs` es `void`.
