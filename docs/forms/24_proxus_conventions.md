# Convenciones de formularios en Proxus

## Distribución

```text
frontend-core  Form.make: schema, runtime, submit y atoms neutrales
frontend-web   adapters Effect Form → @proxus/ui
apps/web       FormReact.make(form, { fields }) y composición de pantallas
```

Una form compartida se exporta en minúscula (`loginForm`). El binding visual usa PascalCase (`LoginForm`). React Native puede enlazar la misma form neutral con otros adapters.

## API React

- `Provider` inicializa defaults y lifecycle.
- `Form` renderiza el elemento HTML, previene navegación y escribe en `form.submit`.
- `Submit` se asocia por `formId`, también fuera del elemento `<form>`, y gestiona waiting/disabled.
- `KeepAlive` se reserva para wizards o tabs.
- `Provider` está eliminado.

El contexto del binding es privado y solo contiene metadata DOM. No se añaden `useForm`, `{ atoms }`, aliases ni estado React paralelo. Los componentes leen directamente:

```ts
const result = useAtomValue(loginForm.submit)
const values = useAtomValue(loginForm.values)
const reset = useAtomSet(loginForm.reset)
```

## Campos UI

Los adapters reutilizables están en `@proxus/frontend-web/form` y usan primitives de `@proxus/ui`. Conectan `value`, `onChange`, `onBlur`, error, validación y disabled; proporcionan label, `FieldError`, `aria-invalid` y `aria-describedby`. Las props del control son directas, nunca `input={{ ... }}`.

Los schemas compartidos emiten claves de validación. Los adapters las resuelven con `MessagesCatalog` y conservan fallback para errores técnicos.

## Submit y errores

`form.submit` sigue siendo un `AtomResultFn`: valida, decodifica, ejecuta la operación e invalida sus reactivity keys. El binding no duplica esa lógica. El producto puede leer su `AsyncResult` para copy/spinner y debe localizar errores remotos mediante `MessagesCatalog`.

## Pruebas

- Inferencia renderer-neutral de values/output/error/submit args.
- Provider/ownership, submit válido e inválido, doble submit y botón externo.
- Adapters por label/role/error/ARIA/interacción.
- Validaciones y errores remotos en los locales soportados.
- `KeepAlive` en flows que lo necesitan.
