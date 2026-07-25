# Plan de rediseño de la API React de Effect Form

## Context

La API local de `@proxus/effect-form/react` expone hoy `Initialize`, campos generados y atoms (`submit`, `reset`, etc.), pero no una primitive HTML `<form>`. Cada pantalla debe componer manualmente `Initialize`, `<form>`, `preventDefault()` y `submit()`. Además, los adapters Effect Form → `@proxus/ui` están duplicados en auth y registration, pese a que `@proxus/ui` ya ofrece `Field`, `FieldLabel`, `FieldControl`, `FieldError`, `Input`, `Textarea` y `Checkbox`.

Objetivo: definir una API React cómoda y tipada para el caso habitual, sin ocultar `AsyncResult`, sin acoplar el motor neutral a Proxus UI y preservando las operaciones avanzadas existentes.

## Hallazgos iniciales

- `BuiltForm` ya concentra los componentes de campo y todos los atoms públicos en `packages/effect-form/src/react/FormReact.tsx`.
- `Initialize` inicializa el estado en un efecto, monta auto-submit y no renderiza DOM.
- `submit` es un `AtomResultFn<SubmitArgs, A, E | SchemaError>`; valida, ejecuta `onSubmit`, registra el último submit solo si tiene éxito e invalida `reactivityKeys` tras éxito.
- Los argumentos de submit son genéricos y pueden impedir una integración trivial con `<form>` cuando no son `void`.
- `packages/ui` contiene primitives agnósticas de Effect; los adapters deben vivir fuera de `packages/ui`.
- `packages/frontend-web` todavía no depende de React, `@proxus/effect-form` ni `@proxus/ui`; alojar adapters allí exige ampliar sus dependencias/exports o crear otro paquete de integración.

## API actual y fricción concreta

Login necesita actualmente cuatro piezas coordinadas por la página:

```tsx
const [result, submitLogin] = useAtom(loginForm.submit)

const onSubmit = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault()
  submitLogin()
}

<loginForm.Initialize defaultValues={defaults}>
  <form className="space-y-4" onSubmit={onSubmit}>
    <loginForm.email label="Email" input={{ type: "email" }} />
    <Button type="submit" disabled={result.waiting}>
      {result.waiting ? "Entrando…" : "Entrar"}
    </Button>
  </form>
</loginForm.Initialize>
```

La página conoce detalles mecánicos que pertenecen a la integración del formulario: inicialización, evento DOM, `preventDefault`, invocación del atom y política de re-submit. También debe suscribirse manualmente al atom solo para obtener `waiting` y el error remoto. El adapter de campo añade una envoltura `input={{...}}` y está duplicado entre features.

`waiting` tiene cuatro significados que conviene separar:

1. **Suscribirse al estado** del submit.
2. **Evitar otro submit** mientras el anterior sigue en ejecución.
3. **Deshabilitar todos los controles** del formulario.
4. **Decidir la presentación** concreta: spinner, texto, error, etc.

La API recomendada hará directamente **1 y 2**. Expondrá el `AsyncResult` al contenido para **4**, porque el motor no debe importar `Button` ni imponer una presentación. No hará **3** automáticamente: envolver todo en un `fieldset disabled` también bloquearía controles secundarios como cancelar o volver, y sería una política de producto. Los adapters sí propagarán `disabled` cuando la pantalla decida aplicarlo.

## API recomendada: definición neutral + compound components por renderer

La propuesta aplica composición sin ocultar el modelo de Effect Atom: una form neutral concentra schema, runtime, submit **y sus atoms públicos**; cada renderer enlaza adapters visuales y genera compounds que cierran sobre esa form estable. El contexto React no transporta los atoms —se importan directamente—, solo coordina lifecycle y metadata DOM como `formId`.

#### La form neutral vive en `frontend-core`

Sí: todas las forms reutilizables por web y una futura React Native deben definirse en `packages/frontend-core`. Actualmente `FormReact.make` mezcla comportamiento neutral y renderer; se separarán así:

```ts
// packages/frontend-core/src/auth/login-form.ts
import { Form, FormBuilder } from "@proxus/effect-form"

export const loginForm = Form.make({
  builder: FormBuilder.empty
    .addField(EmailField)
    .addField(CurrentPasswordField),

  runtime: applicationRuntime,
  mode: { validation: "onSubmit" },
  reactivityKeys: ["auth"],

  onSubmit: (_, { decoded }) => Effect.gen(function*() {
    const input = yield* Schema.decodeUnknownEffect(
      LoginWithPasswordInput,
    )(decoded)
    const client = yield* publicApiClient
    return yield* client.auth.loginWithPassword({ payload: input })
  }),
})
```

`Form.make` devuelve directamente la API neutral de Effect Form, con atoms estables importables:

```ts
loginForm.values
loginForm.isDirty
loginForm.rootError
loginForm.submit
loginForm.validate
loginForm.reset
loginForm.setValues
loginForm.fields.email
loginForm.fields.password
```

Cada `AtomRegistry` mantiene su propio estado, así que web y React Native pueden importar los mismos atoms sin compartir valores en memoria. No hace falta que cada renderer vuelva a crearlos.

#### Binding web

Web añade únicamente los componentes visuales y usa un nombre distinto, en PascalCase, para no confundirlo con la form neutral:

```tsx
// apps/web/src/modules/auth/login-form.ts
import { loginForm } from "@proxus/frontend-core/auth"

export const LoginForm = FormReact.make(loginForm, {
  fields: {
    email: TextField,
    password: TextField,
  },
})
```

Una futura app nativa haría el binding equivalente sin redefinir schema ni submit:

```tsx
export const LoginForm = FormNative.make(loginForm, {
  fields: {
    email: NativeTextField,
    password: NativeSecureField,
  },
})
```

No se documentará una intersección de tipos manual como `BuiltReactForm & {...}`. `FormReact.make` infiere y devuelve un objeto pequeño de **componentes**, mientras `loginForm` conserva los **atoms**:

```ts
// Neutral, importable desde frontend-core
loginForm.submit
loginForm.values
loginForm.reset

// React web, importable desde el módulo web
LoginForm.Provider
LoginForm.Form
LoginForm.Submit
LoginForm.email
LoginForm.password
```

No tiene sentido compartir también el mapping visual: HTML y React Native tienen controles, eventos y accesibilidad diferentes. La única separación necesaria es:

```text
frontend-core: loginForm       = comportamiento + atoms
web:           LoginForm       = compounds HTML + adapters web
native:        LoginForm       = compounds native + adapters native
```

#### Cómo implementa `FormReact.make` el objeto `LoginForm`

Pseudocódigo cercano a la implementación prevista:

```tsx
export const make = (form, { fields }) => {
  const FormContext = React.createContext<null | { formId: string }>(null)

  // El make real itera las fields; para login equivale a esto:
  const fieldComponents = {
    email: makeFieldComponent(
      form.internal.fieldDefs.email,
      form.internal.getOrCreateFieldAtoms,
      fields.email,
    ),
    password: makeFieldComponent(
      form.internal.fieldDefs.password,
      form.internal.getOrCreateFieldAtoms,
      fields.password,
    ),
  }

  function Provider({ defaultValues, children, validateOnInit }) {
    const formId = React.useId()

    return (
      <InitializationBoundary
        form={form.internal}
        defaultValues={defaultValues}
        validateOnInit={validateOnInit}
      >
        <FormContext value={{ formId }}>
          {children}
        </FormContext>
      </InitializationBoundary>
    )
  }

  function Form({ children, getSubmitArgs, ...htmlProps }) {
    const { formId } = useRequiredContext(FormContext)
    const [result, submit] = useAtom(form.submit)

    const handleSubmit = (event) => {
      event.preventDefault()
      if (result.waiting) return
      submit(getSubmitArgs ? getSubmitArgs(event) : undefined)
    }

    return (
      <form {...htmlProps} id={formId} onSubmit={handleSubmit}>
        {children}
      </form>
    )
  }

  function Submit({ asChild, children }) {
    const { formId } = useRequiredContext(FormContext)
    const result = useAtomValue(form.submit)

    return renderButtonOrSlot({
      asChild,
      children,
      type: "submit",
      form: formId,
      disabled: result.waiting,
      "aria-busy": result.waiting,
      "data-waiting": result.waiting || undefined,
    })
  }

  // Para el binding concreto de login, el resultado es explícito:
  return {
    Provider,
    Form,
    Submit,
    KeepAlive,
    email: fieldComponents.email,
    password: fieldComponents.password,
  }
}
```

`makeFieldComponents` no crea estado ni decide qué UI mostrar. Es la iteración genérica que produce `email` y `password` en el ejemplo anterior. Para cada definición neutral:

1. localiza/crea sus field atoms por path (`value`, touched, error, dirty, validation);
2. se suscribe granularmente con los hooks de Effect Atom;
3. construye el `FieldState` agnóstico que ya existe;
4. renderiza el adapter web asociado (`TextField`, `NumberField`, etc.).

Versión simplificada de `makeFieldComponent`:

```tsx
function makeFieldComponent(fieldDef, getFieldAtoms, Component) {
  return function GeneratedField(props) {
    const atoms = React.useMemo(
      () => getFieldAtoms(fieldDef.name, fieldDef.schema),
      [fieldDef],
    )

    const [value, setValue] = useAtom(atoms.valueAtom)
    const error = useAtomValue(atoms.displayErrorAtom)
    const isDirty = useAtomValue(atoms.isDirtyAtom)
    const isValidating = useAtomValue(atoms.validationAtom).waiting
    const setTouched = useAtomSet(atoms.touchedAtom)

    return (
      <Component
        field={{
          path: fieldDef.name,
          value,
          error,
          isDirty,
          isValidating,
          onChange: setValue,
          onBlur: () => setTouched(true),
        }}
        props={props}
      />
    )
  }
}
```

La implementación real reutilizará las funciones actuales `makeFieldComponents`, `makeFieldComponent` y `makeArrayFieldComponent` de `FormReact.tsx`; solo cambiará de dónde reciben los internals. Arrays mantienen su path/index context y operaciones actuales. El pseudocódigo omite tipos y cleanup, pero deja claro que `LoginForm` no contiene un segundo estado: sus fields y compounds cierran sobre el `loginForm` neutral recibido.

#### Uso habitual

Se evita `AuthShell` en este ejemplo porque es un componente visual específico de la aplicación y no forma parte de Effect Form:

```tsx
<LoginForm.Provider
  defaultValues={{ email: "", password: "" }}
>
  <section aria-labelledby="login-title">
    <h1 id="login-title">Inicia sesión</h1>

    <LoginRemoteError />

    <LoginForm.Form className="space-y-4">
      <LoginForm.email
        label="Email"
        type="email"
        autoComplete="email"
      />

      <LoginForm.password
        label="Contraseña"
        type="password"
        autoComplete="current-password"
      />

      <LoginForm.Submit asChild>
        <Button>Entrar</Button>
      </LoginForm.Submit>
    </LoginForm.Form>
  </section>
</LoginForm.Provider>
```

Semántica:

- **`LoginForm.Provider`**: reemplaza `Initialize`; inicializa `loginForm`, monta auto-submit y crea un contexto privado con metadata DOM. No transporta ni reexporta atoms.
- **`LoginForm.Form`**: renderiza `<form>`, hace `preventDefault`, resuelve `SubmitArgs` y escribe en `loginForm.submit`. Bloquea re-submit mientras espera.
- **Campos generados**: conservan sus suscripciones granulares a los field atoms de `loginForm`.
- **`LoginForm.Submit`**: lee directamente `loginForm.submit` y añade `type="submit"`, `disabled`, `aria-busy`, `data-waiting` y `form={formId}` al botón hijo mediante `asChild`.
- **Componentes de producto**: importan `loginForm.values`, `loginForm.submit`, etc. y usan los hooks normales de Effect Atom. No habrá `useForm()` ni un objeto `{ atoms }` intermedio.

#### Lectura directa de atoms, igual que Effect Form actual

Sí, importar el atom directamente es más sencillo y funciona porque `loginForm` es estable y el `RegistryProvider` mantiene el estado. La API propuesta conserva el estilo actual:

```tsx
const result = useAtomValue(loginForm.submit)
const reset = useAtomSet(loginForm.reset)
const values = useAtomValue(loginForm.values)
```

El contexto React se reserva para datos que **no son atoms** y dependen de la posición en el árbol: comprobar que existe `LoginForm.Provider`, asociar un botón externo mediante `formId` y compartir la política DOM del renderer.

##### Error remoto y traducciones

Ya existe un sistema tipado parcial en `@proxus/product-messages`: `MessagesCatalog`, `catalogFor(locale)` y un `messagesCatalogAtom` derivado del locale. Actualmente el catálogo no contiene auth y varias validaciones están escritas directamente en español. El plan no debe añadir más textos hardcoded.

Se ampliará el catálogo:

```ts
interface MessagesCatalog {
  readonly auth: {
    readonly login: {
      readonly title: string
      readonly submit: string
      readonly submitting: string
      readonly failed: string
    }
  }
}
```

Y el componente leerá ambos atoms directamente:

```tsx
function LoginRemoteError() {
  const result = useAtomValue(loginForm.submit)
  const messages = useAtomValue(messagesCatalogAtom)

  return (
    <p role="alert" hidden={!AsyncResult.isFailure(result)}>
      {messages.auth.login.failed}
    </p>
  )
}
```

La resolución estable/importable de `messagesCatalogAtom` debe seguir la arquitectura general de atoms estables; mientras la API actual siga siendo factory, el binding web puede recibir/importar el atom compuesto por la aplicación. Esto no debe resolverse con strings dentro de Effect Form.

Los mensajes de validación requieren una decisión adicional porque Effect Schema produce actualmente `ErrorEntry.message: string`. La recomendación es que los schemas compartidos emitan claves estables (`auth.login.email.required`) y que el adapter web las resuelva contra `MessagesCatalog`, conservando fallback al string original para errores técnicos/default de Schema. Así la misma `loginForm` sirve para web/native y cambia de idioma sin reconstruir sus atoms.

##### Preview de valores

```tsx
function ProfilePreview() {
  const values = useAtomValue(profileForm.values)

  return Option.match(values, {
    onNone: () => null,
    onSome: (value) => (
      <ProfileCard name={value.name} biography={value.biography} />
    ),
  })
}

<ProfileForm.Provider defaultValues={defaults}>
  <div className="grid grid-cols-2 gap-6">
    <ProfileForm.Form>
      <ProfileForm.name label="Nombre" />
      <ProfileForm.biography label="Biografía" />
      <ProfileForm.Submit asChild><Button>Guardar</Button></ProfileForm.Submit>
    </ProfileForm.Form>
    <ProfilePreview />
  </div>
</ProfileForm.Provider>
```

El preview es hermano del `<form>` y lee el atom neutral importado; solo necesita estar dentro del provider para que la form esté inicializada.

##### Action footer y submit fuera del elemento `<form>`

```tsx
function EditProfileFooter() {
  const isDirty = useAtomValue(profileForm.isDirty)
  const submission = useAtomValue(profileForm.submit)
  const reset = useAtomSet(profileForm.reset)

  return (
    <footer>
      <Button type="button" variant="ghost" disabled={!isDirty} onClick={reset}>
        Descartar
      </Button>

      <ProfileForm.Submit asChild>
        <Button loading={submission.waiting}>Guardar</Button>
      </ProfileForm.Submit>
    </footer>
  )
}

<ProfileForm.Provider defaultValues={defaults}>
  <Dialog>
    <ProfileForm.Form>
      <ProfileForm.name label="Nombre" />
    </ProfileForm.Form>

    {/* Submit obtiene formId del contexto y funciona fuera del DOM <form>. */}
    <EditProfileFooter />
  </Dialog>
</ProfileForm.Provider>
```

##### Acción programática con argumentos

```tsx
function ArticleActions() {
  const [submission, submit] = useAtom(articleForm.submit)

  return (
    <>
      <Button
        type="button"
        disabled={submission.waiting}
        onClick={() => submit({ intent: "draft" })}
      >
        Guardar borrador
      </Button>
      <Button
        type="button"
        disabled={submission.waiting}
        onClick={() => submit({ intent: "publish" })}
      >
        Publicar
      </Button>
    </>
  )
}
```

Esto es exactamente la semántica actual de `AtomResultFn`; no necesita contexto público.

#### Contexto interno y granularidad

El provider no copia valores ni atoms. Su contexto privado es mínimo y estable:

```ts
interface InternalFormContext {
  readonly formId: string
}
```

`LoginForm.Form` y `LoginForm.Submit` conocen `loginForm` porque `FormReact.make(loginForm, ...)` cierra sobre esa instancia. Los componentes de producto importan los atoms directamente. Por tanto, escribir en un field no cambia el contexto ni rerenderiza todo el provider.

#### Comparación exacta con Effect Form actual

| Responsabilidad | API/implementación actual | Provider + compounds propuesto |
| --- | --- | --- |
| Definición | `FormReact.make(builder, options)` mezcla comportamiento y renderer | `Form.make(...)` en frontend-core + `FormReact.make(form, { fields })` en web |
| Fuente de estado | atoms de `FormAtoms.make` | Los mismos atoms; sin estado paralelo |
| Inicialización | `<form.Initialize defaultValues>` ejecuta un efecto y monta auto-submit | `<form.Provider defaultValues>` reutiliza esa lógica y además publica contexto |
| HTML `<form>` | Lo escribe cada pantalla | `<form.Form>` dentro de `Provider` |
| Evento submit | Handler manual con `preventDefault` | Gestionado por el compound `<form.Form>` |
| Resultado | `useAtom(form.submit)` | Igual: `useAtom(loginForm.submit)`; `LoginForm.Submit` lo usa internamente |
| Campos | Componentes generados que cierran sobre field atoms | Los mismos componentes, con guard/contexto común y disabled heredable |
| Actions externas | Hooks sobre atoms importados | Igual: hooks directos sobre los atoms neutrales |
| Botón pending | La pantalla lee `result.waiting` y deshabilita | `Submit` deshabilita automáticamente; UI puede leer submission para spinner |
| Composición fuera del form | Posible solo compartiendo atoms manualmente | Natural mientras permanezca dentro del provider |
| Arrays/auto-submit | Implementados en `FormReact`/`FormAtoms` | Se reutilizan sin cambiar el motor |
| Migración | Permite composición manual con `Initialize` | Breaking change: `Initialize` desaparece y todos los consumidores deben usar `Provider` |

Implementativamente, los components generados seguirán cerrando sobre `stateAtom`, `submitAtom`, `onBlurSubmitAtom` y field families. La diferencia es que esos atoms nacen en `Form.make` y `FormReact.make` recibe la form ya construida. El nuevo contexto solo contiene `formId`/ownership DOM; todas las lecturas reactivas siguen pasando por `@effect/atom-react`.

Esta es la única API objetivo del plan. No se implementarán wrappers genéricos, hooks de props ni una segunda variante render-prop en paralelo.

## Implementación recomendada: provider + compound components

`FormAtoms` conservará su lógica y pasará a quedar detrás de una API neutral más clara:

1. Añadir `Form.make` en la capa neutral. Internamente llama a `FormAtoms.make` y devuelve los atoms públicos estables más un handle privado/simbolizado que los renderers necesitan para field families e inicialización.
2. No cambiar validación, mutation, `AsyncResult`, invalidación ni nombres de los atoms públicos.
3. Adaptar `FormReact.make(form, { fields })` para que reciba la form neutral ya construida y solo configure componentes del renderer.
4. Crear dentro de cada binding React un contexto privado y tipado cuyo value estable contiene únicamente `formId`; mezclar compounds de dos forms debe fallar con un mensaje claro.
5. Extraer la lógica interna de inicialización hacia `Provider` y eliminar `Initialize` del tipo/objeto retornado por `FormReact.make` en el mismo cambio.
6. Implementar `Form` como consumidor del contexto: HTML props, `preventDefault`, argumentos tipados y protección de re-submit escribiendo directamente en `form.submit`.
7. Implementar `Submit` headless cerrando sobre `form.submit` y usando `formId`; estudiar si basta `React.cloneElement` o conviene una primitive Slot sin añadir dependencia innecesaria.
8. No implementar `useForm`, un objeto `{ atoms }`, aliases `busy/error` ni callbacks action paralelos.
9. Mantener las suscripciones granulares de los campos y medir mediante tests de render que editar un campo no rerenderiza descendientes no relacionados.
10. No envolver automáticamente en `<fieldset disabled>` ni conocer `@proxus/ui`; `Submit` gestiona el bloqueo de la acción primaria y la feature decide si deshabilita el resto.

Para `SubmitArgs != void`, el contrato tentativo será condicional:

```tsx
<ArticleForm.Provider defaultValues={defaults}>
  <ArticleForm.Form
    getSubmitArgs={(event) => {
      const submitter = event.nativeEvent.submitter
      return { intent: submitter?.getAttribute("data-intent") ?? "publish" }
    }}
  >
    ...
  </ArticleForm.Form>
</ArticleForm.Provider>
```

```ts
type SubmitArgsProps<Args> = [Args] extends [void]
  ? { readonly getSubmitArgs?: never }
  : {
      readonly getSubmitArgs: (
        event: React.FormEvent<HTMLFormElement> & {
          readonly nativeEvent: SubmitEvent
        }
      ) => Args
    }
```

Se prefiere una función al valor fijo `submitArgs`, porque soporta varios submitters y evita capturar datos obsoletos. Los formularios simples no ven esta prop.

## Approach

La API objetivo es **form neutral en frontend-core + binding por renderer + provider/compound components**. `Provider` posee inicialización/contexto DOM; `Form` posee el evento HTML; `Submit` consume internamente el atom neutral. El resto de componentes importa los atoms directamente. No se desarrollarán APIs alternativas en paralelo.

No habrá capa de compatibilidad para `Initialize`: al eliminarlo, el typecheck debe fallar en todos los consumidores antiguos hasta que se migren a `Provider`. Los atoms públicos siguen siendo la API neutral principal compartida con React Native; cada renderer aporta únicamente componentes visuales.

Los adapters web serán reutilizables y usarán props directas del control; `packages/ui` permanecerá libre de Effect Form. La ubicación definitiva del paquete de integración queda pendiente de decidir.

## Files to modify

Preliminares:

- nuevo `packages/effect-form/src/Form.ts` (o nombre final de la definición neutral) y export en `src/index.ts`
- `packages/effect-form/src/FormAtoms.ts`
- `packages/effect-form/src/react/FormReact.tsx`
- tests neutrales, React y de tipos de `packages/effect-form/test/`
- `packages/frontend-web/package.json` y un nuevo export `./form`, **si** se elige ese paquete para adapters
- nuevos adapters web para `TextField`, `NumberField`, `CheckboxField` y, según uso real, `TextareaField`
- `packages/frontend-core/src/auth/forms.ts` y nuevos módulos por form (`login-form.ts`, después recovery/registration) con atoms neutrales
- `apps/web/src/modules/auth/forms.tsx`
- `apps/web/src/modules/auth/login-page.tsx`
- `apps/web/src/modules/registration/forms.tsx`
- `packages/product-messages/src/catalog.ts` para copy de auth y claves de validación localizables
- módulo estable/composición de `messagesCatalogAtom` en frontend-core/web si resulta necesario para evitar la factory en vistas
- `docs/forms/01_basic_form_setup.md`, `15_custom_submit_arguments.md`, `23_field_component_props.md` y `24_proxus_conventions.md`

## Reuse

- Estado, validación y submit existentes en `packages/effect-form/src/FormAtoms.ts`.
- Lógica de inicialización que hoy está dentro de `InitializeComponent` y componentes generados de `packages/effect-form/src/react/FormReact.tsx`; se reutiliza internamente, pero se elimina la API pública `Initialize`.
- Primitives de `packages/ui/src/components/field.tsx`, `input.tsx`, `textarea.tsx` y `checkbox.tsx`.
- Convención actual de render directo de `AsyncResult` usada por `apps/web/src/modules/auth/login-page.tsx`.
- Catálogos tipados `MessagesCatalog`/`catalogFor` de `packages/product-messages/src/catalog.ts` y `messagesCatalogAtom` de `packages/frontend-core/src/product-locale/atoms.ts`.

## Steps

- [x] Cerrar el contrato de `Form.make` neutral y comprobar por tipos que bindings web/native hipotéticos infieren los mismos values/output/error/submit args.
- [x] Cerrar nombres y contrato de `Provider`, `Form` y `Submit`, incluidos argumentos y eliminación explícita de `Initialize`.
- [x] Crear tests de tipos y comportamiento, incluyendo `Submit` fuera del elemento `<form>`.
- [x] Implementar `Form.make` sobre `FormAtoms.make` y adaptar `FormReact.make(form, { fields })` sin duplicar lógica ni configuración funcional.
- [x] Implementar el contexto privado estable `{ formId }` por binding.
- [x] Implementar provider y compounds cerrando directamente sobre los atoms neutrales.
- [x] Implementar adapters web accesibles con props directas sobre primitives de `@proxus/ui`.
- [x] Ampliar `MessagesCatalog` para auth y definir cómo se resuelven claves de validación en los adapters.
- [x] Migrar primero login para validar internamente el diseño, aceptando que el workspace permanezca rojo en este punto.
- [x] Migrar en el mismo cambio todos los consumidores web: forgot password, recovery code, new password, registration profile/account y el contract test.
- [x] Verificar `AsyncResult`, errores de schema traducidos, error remoto localizado y flows con `KeepAlive`.
- [x] Eliminar adapters locales y actualizar convenciones/documentación; solo entonces restaurar typecheck/tests verdes.

## Verification

- Tests de `@proxus/effect-form`: provider/context, error fuera de provider, compound components dentro y fuera del `<form>`, `preventDefault`, submit válido/inválido, doble submit, atributos HTML, inicialización una sola vez, desmontaje/remontaje, submit args y auto-submit.
- Tests de granularidad: editar un campo no debe rerenderizar todos los descendientes debido a un contexto con valores cambiantes.
- Tests de tipos: values/output/error/submit args atraviesan `Form.make` y el binding React sin perder inferencia; `submitArgs` es requerido solo cuando no sea `void`.
- Test de contrato renderer-neutral con un binding mínimo/ficticio que demuestre que la definición no depende de DOM ni React, sin implementar todavía React Native.
- Tests de adapters web por role/label, error accesible, `aria-*`, blur/change, disabled y tipos de control.
- Tests de mensajes auth/validación en español e inglés y cambio de locale sin reconstruir la form neutral.
- Typecheck y tests de `@proxus/effect-form`, `@proxus/frontend-web` y `@proxus/web`.
- Verificación manual de login y registration sin recarga HTML y con invalidación de sesión tras éxito.

## Preguntas y decisiones abiertas

Estas preguntas forman parte deliberadamente del plan: no hace falta resolverlas todas antes de la primera revisión y se irán cerrando en iteraciones.

### 1. ¿Qué son los adapters Effect Form → `@proxus/ui` y dónde deben vivir?

Effect Form entrega a cada field component un estado agnóstico de UI:

```ts
{
  value,
  onChange,
  onBlur,
  error,
  isTouched,
  isValidating,
  isDirty,
}
```

`@proxus/ui` entrega primitives visuales (`Field`, `FieldLabel`, `Input`, `FieldError`), pero no conoce Effect Form. El **adapter** es el pequeño componente puente que traduce un contrato al otro:

```tsx
export const TextField: FormReact.FieldComponent<
  string,
  TextFieldProps
> = ({ field, props }) => {
  const error = Option.getOrUndefined(field.error)
  const id = props.id ?? field.path
  const errorId = `${id}-error`

  return (
    <Field invalid={error !== undefined} disabled={props.disabled}>
      <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
      <FieldControl>
        <Input
          {...props}
          id={id}
          value={field.value}
          onChange={(event) => field.onChange(event.target.value)}
          onBlur={field.onBlur}
          aria-invalid={error !== undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </FieldControl>
      <FieldError id={errorId}>{error}</FieldError>
    </Field>
  )
}
```

No valida ni ejecuta mutations: solo conecta eventos/estado con markup accesible. Hoy existe una versión de `TextField` en auth y otra distinta en registration; centralizarla elimina esa duplicación. No debe vivir en `@proxus/ui`, porque eso obligaría al design system a depender de Effect Form.

Opciones de ubicación:

- **`@proxus/frontend-web/form`**: centraliza la integración web, pero hace que `frontend-web` pase a depender de React, `@proxus/effect-form` y `@proxus/ui`.
- **`@proxus/effect-form/ui`**: deja clara la integración con el design system, pero acopla el paquete del motor al UI de Proxus.
- **`apps/web`**: evita ampliar paquetes compartidos, pero impide reutilizar los adapters y puede volver a generar duplicación.
- **Nuevo paquete de integración**: boundaries más claros a cambio de otro workspace package.

Recomendación provisional: comprobar primero el rol arquitectónico deseado para `frontend-web`; si admite adapters React, usar `@proxus/frontend-web/form`. En caso contrario, crear un paquete de integración pequeño en vez de acoplar el motor a `@proxus/ui`.

### 2. ¿Cuándo inicializa o reinicia el estado `Provider`?

La API objetivo fija que `Provider` recibe los valores iniciales y `Form` exige estar dentro:

```tsx
<LoginForm.Provider defaultValues={{ email: "", password: "" }}>
  <LoginForm.Form>...</LoginForm.Form>
</LoginForm.Provider>
```

Comportamiento recomendado, explicado de forma concreta:

1. Al montar por primera vez, copia `defaultValues` al estado de los fields.
2. Si el padre vuelve a renderizar y pasa otro objeto `defaultValues`, **no** sobrescribe lo que el usuario ya ha escrito. Los defaults son valores iniciales, no estado controlado.
3. Si se abandona la pantalla y se desmonta el provider, al volver se crea un formulario nuevo con sus defaults.
4. Solo cuando se monta deliberadamente `LoginForm.KeepAlive`, el estado sobrevive al desmontaje —útil para un wizard, no para login.
5. Escribir en `loginForm.reset` vuelve a los defaults de esa inicialización.

Esto conserva el comportamiento actual de `Initialize` y evita que un rerender borre campos. Los tests cubrirán las cinco situaciones; la única decisión pendiente es si `KeepAlive` continúa siendo un componente separado o pasa a ser una opción explícita del provider.

### 3. ¿Qué contrato tendrán los argumentos personalizados de submit?

- **Contrato completo desde el inicio**: `submitArgs` requerido cuando `SubmitArgs` no es `void`, aceptando un valor o una función derivada del evento/submitting button.
- **Primera versión solo para `void`**: los formularios avanzados usarían `Provider` y `useAtom(form.submit)` manualmente, sin `Initialize`.

Recomendación provisional: diseñar y probar los tipos completos antes de implementar, aunque el primer consumidor sea login. Evita publicar una API que después necesite un cambio incompatible.

### 4. ¿Qué parte de waiting debe gestionar automáticamente `Form`?

La recomendación revisada es:

- `Form` se suscribe internamente al `AsyncResult`.
- `Form` ignora por defecto nuevos eventos de submit mientras `result.waiting`.
- El comportamiento puede desactivarse con `preventSubmitWhileWaiting={false}` si un caso de uso necesita la semántica concurrente/interrumpible del atom.
- `LoginForm.Form` y `LoginForm.Submit` leen internamente `loginForm.submit`. Un componente custom usa directamente `useAtomValue(loginForm.submit)`.
- `Form` **no** deshabilita todo el árbol automáticamente ni decide spinner/texto; esa presentación permanece en `@proxus/ui`/la feature.

Pregunta pendiente: ¿queremos que la protección contra re-submit sea siempre obligatoria, o conservar la prop de escape `preventSubmitWhileWaiting`?

### 5. ¿Effect Form debe desactivar por defecto la validación HTML nativa?

- Añadir siempre `noValidate`, haciendo de Effect Form la única autoridad.
- Respetar HTML nativo y permitir que el consumidor pase `noValidate`.
- Añadir una opción explícita de configuración al crear el form.

Recomendación provisional: no imponerlo desde la librería. `Form` debe propagar atributos HTML y cada producto decide si usa `noValidate`.

### 6. ¿Qué significa `onSubmit` en las props HTML de `Form`?

Opciones:

- Omitirlo para evitar una segunda operación que compita con el `onSubmit` de `FormReact.make`.
- Exponer un callback de observación que se ejecute antes o después de despachar el atom.
- Renombrar ese callback a `onSubmitEvent`/`onSubmitted` para distinguir evento DOM de mutation.

Recomendación provisional: omitir `onSubmit` en la primera API. La operación pertenece a `Form.make({ onSubmit })`; si aparece una necesidad real de observación DOM, añadir después un nombre inequívoco.

### 7. ¿Hasta dónde llega la migración breaking?

Decisión revisada: todos los usos de `Initialize` en `apps/web` se migran en el mismo cambio. Login sirve como primer caso durante el desarrollo, pero no se conserva compatibilidad ni se considera terminado mientras auth recovery, registration y contract tests sigan usando la API anterior. Admin continúa fuera de alcance porque no consume actualmente Effect Form.

### 8. ¿Confirmamos los nombres `Provider` y `Form`?

La API central del plan es:

```tsx
<ProfileForm.Provider defaultValues={defaults}>
  <ProfileForm.Form>
    <ProfileForm.name label="Nombre" />
  </ProfileForm.Form>

  {/* Footer real con Descartar/Guardar; es hermano del <form>. */}
  <EditProfileFooter />
</ProfileForm.Provider>
```

`EditProfileFooter` es el componente mostrado anteriormente: importa `profileForm.reset`, `profileForm.isDirty` y `profileForm.submit` desde frontend-core; su botón Guardar usa `ProfileForm.Submit`, que obtiene el `formId` privado y queda asociado al `<form>`. No es una primitive de Effect Form ni un nombre especial, solo demuestra que un componente de producto puede usar la misma form aunque esté fuera del elemento HTML.

Recomendación provisional: usar `Provider` y `Form`. `Provider` comunica ownership de estado/contexto mejor que `Layout`; `Form` comunica que renderiza el elemento HTML. No añadir `Layout`, `Frame` ni una variante compacta hasta que exista una necesidad demostrada.

### 9. ¿Necesitamos un hook público de contexto?

Recomendación: no. Los componentes de producto importan atoms neutrales (`loginForm.submit`, `profileForm.values`) y los compounds del binding cierran sobre la misma form. El contexto con `formId` queda privado. Solo se añadirá un hook público si aparece un caso que necesite metadata DOM y no pueda expresarse con `Submit`.

### 10. ¿Implementamos un renderer React Native ahora?

No parece necesario para mejorar web. La recomendación es hacer `Form.make` realmente neutral y añadir tests de tipos/contrato con un binding ficticio, pero no crear `FormNative` ni modificar una app mobile hasta que exista un consumidor real. Así validamos el boundary sin ampliar el alcance.

### 11. ¿Incluimos la localización de validaciones en esta migración?

Sí existe infraestructura de idiomas, pero auth todavía no está cubierta y los schemas contienen español. Al mover las forms a frontend-core esto se vuelve más visible. Recomendación provisional: incluir al menos login en el cambio piloto —catálogo auth en `product-messages`, claves estables de validación y resolución en el adapter— y dejar la migración completa de recovery/registration para sus pasos posteriores.
