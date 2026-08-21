# Convenciones de formularios en Proxus

## Distribución

```text
frontend-core  Field/FormBuilder: schemas y definición neutral
apps/webapp       adapters Effect Form → @proxus/ui
apps/webapp       FormReact.make(builder, options) y composición de pantallas
```

`frontend-core` no exporta una instancia de formulario ni depende de React:
exporta builders reutilizables. Cada plataforma construye su integración,
runtime y submit. El binding visual web usa PascalCase (`LoginForm`).

## API React

- `Initialize` inicializa los defaults y el lifecycle.
- La pantalla renderiza un `<form>` HTML, hace `preventDefault()` y despacha
  mediante `useAtomSet(LoginForm.submit)`.
- El botón usa `type="submit"` y deriva `waiting` leyendo el mismo atom.
- `KeepAlive` se reserva para wizards o tabs.

No se añaden wrappers locales para recrear `Provider`, `Form` o `Submit`. Los
componentes leen directamente los atoms de la instancia:

```ts
const result = useAtomValue(LoginForm.submit)
const values = useAtomValue(LoginForm.values)
const reset = useAtomSet(LoginForm.reset)
```

## Campos UI

Los adapters web están en `apps/webapp/src/platform/form` y usan primitives de `@proxus/ui`. Conectan `value`, `onChange`, `onBlur`, error, validación y disabled; proporcionan label, `FieldError`, `aria-invalid` y `aria-describedby`. Las props del control son directas, nunca `input={{ ... }}`.

Los schemas compartidos emiten claves de validación. Los adapters las resuelven con `MessagesCatalog` y conservan fallback para errores técnicos.

## Submit y errores

`form.submit` sigue siendo un `AtomResultFn`: valida, decodifica, ejecuta la operación e invalida sus reactivity keys. El binding no duplica esa lógica. El producto puede leer su `AsyncResult` para copy/spinner y debe localizar errores remotos mediante `MessagesCatalog`.

## Pruebas

- Inferencia renderer-neutral de values/output/error/submit args.
- Inicialización, submit válido e inválido y doble submit.
- Adapters por label/role/error/ARIA/interacción.
- Validaciones y errores remotos en los locales soportados.
- `KeepAlive` en flows que lo necesitan.
