## 15. Custom Submit Arguments

El argumento se declara al crear la form neutral:

```ts
const contactForm = Form.make(contactFormBuilder, {
  runtime,
  onSubmit: (args: { source: string }, { decoded }) =>
    Effect.log(`Contact from ${args.source}: ${decoded.email}`),
})
```

El binding React exige `getSubmitArgs` cuando el argumento no es `void`:

```tsx
const ContactForm = FormReact.make(contactForm, {
  fields: { email: TextField, message: TextField },
})

<ContactForm.Provider defaultValues={defaults}>
  <ContactForm.Form getSubmitArgs={(event) => ({
    source: event.nativeEvent.submitter?.getAttribute("data-source") ?? "page",
  })}>
    {/* fields */}
    <ContactForm.Submit asChild><button data-source="page">Send</button></ContactForm.Submit>
  </ContactForm.Form>
</ContactForm.Provider>
```

Para acciones programáticas se escribe directamente en el atom:

```ts
const submit = useAtomSet(contactForm.submit)
submit({ source: "shortcut" })
```

Auto-submit solo está disponible cuando `SubmitArgs` es `void`.
