# Plan — Navegación SPA idiomática con TanStack Router

## Objetivo

Eliminar la abstracción propia de navegación SPA de `apps/webapp` y hacer que TanStack Router sea el único propietario de URL, History, params, search params, enlaces y navegación interna.

Effect y Effect Atom seguirán siendo responsables de peticiones remotas, mutaciones, `AsyncResult`, formularios, workflows de producto, analytics, persistencia y capacidades externas. La navegación completa del documento usada por OAuth seguirá modelada mediante `DocumentNavigation`.

La coordinación entre una mutación y una navegación posterior se hará en el event handler React con la API real de Effect Atom:

```tsx
const submit = useAtomSet(action, { mode: "promiseExit" })
const navigate = Route.useNavigate()

const exit = await submit(input)
if (Exit.isSuccess(exit)) {
  await navigate({ to: "/..." })
}
```

No se añadirán callbacks de navegación a los inputs de los atoms y no se usará `useEffect` para inferir navegación observando un resultado.

## Alcance por capas

```text
- contrato compartido/API: no
- persistencia y repositories: no
- services/casos de uso backend: no
- handlers HTTP: no
- frontend-core/atoms: sí, solo si es necesario desacoplar URL del flujo neutral
- adapters frontend web: sí
- UI, pantallas y rutas: sí
- tests y fixtures: sí
- documentación: sí
```

## Arquitectura final

### TanStack Router gestionará

- árbol file-based de rutas;
- URL, History y locale;
- params y search params;
- redirects;
- navegación declarativa mediante `Link`;
- navegación imperativa mediante `Route.useNavigate()` o `router.navigate()` cuando no exista contexto React apropiado.

### Effect y Effect Atom gestionarán

- clientes HTTP tipados;
- queries, mutaciones y `AsyncResult`;
- validación y formularios;
- transiciones y workflows de auth y registro;
- analytics;
- persistencia del borrador;
- concurrencia, cancelación y errores;
- navegación externa de OAuth mediante `DocumentNavigation`.

### Flujo esperado

```text
evento React
  → despacha AtomResultFn con mode: "promiseExit"
  → espera Exit
  → si Success, navega con TanStack Router
```

Para enlaces simples:

```text
interacción del usuario → Link tipado de TanStack Router
```

Para OAuth:

```text
atom/workflow Effect → DocumentNavigation → navegación completa fuera de la SPA
```

## 1. Inventario y pruebas de caracterización

Antes de eliminar código:

1. Localizar todos los consumidores de:
   - `navigate`;
   - `navigateAction`;
   - `currentLocale`;
   - `currentSearch`;
   - `setSearch`;
   - `replaceSearch`;
   - `navigationRuntime`.
2. Identificar cada navegación como:
   - enlace interactivo;
   - navegación posterior a mutación;
   - sincronización de search params;
   - redirect por estado;
   - navegación completa del documento.
3. Preservar mediante tests:
   - locale actual;
   - `push` frente a `replace`;
   - parámetros de atribución no relacionados;
   - limpieza de secretos OAuth;
   - ausencia de navegación después de fallo;
   - comportamiento back/forward del wizard.

## 2. Autenticación: sacar navegación SPA de los atoms

Archivo principal:

```text
apps/webapp/src/modules/auth/actions.ts
```

### Actions afectadas

- `openPasswordRecoveryAction`;
- `submitPasswordRecoveryAction`;
- `submitRecoveryCodeAction`;
- `submitNewPasswordAction`;
- `backToLoginAction`.

Cada action conservará únicamente:

- validación del input;
- llamada a atoms de `frontend-core`;
- transición del estado de recuperación;
- resultado tipado de la operación.

Se eliminarán sus llamadas a `navigate(...)` y las actions normales pasarán de `navigationRuntime.fn` a `Atom.fn` cuando ya no consuman servicios externos.

`startGoogleLoginAction` seguirá usando Effect y `DocumentNavigation`, porque abandona la SPA.

### Posibles renombres

Si no amplían innecesariamente el diff:

- `openPasswordRecoveryAction` → `startPasswordRecoveryAction`;
- `backToLoginAction` → `resetPasswordRecoveryAction`.

Los nombres deben describir la transición de aplicación, no prometer navegación.

## 3. Autenticación: navegar desde los event handlers de ruta

Archivos:

```text
apps/webapp/src/routes/$locale/_public/login.tsx
apps/webapp/src/routes/$locale/_public/password-recovery/index.tsx
apps/webapp/src/routes/$locale/_public/password-recovery/code.tsx
apps/webapp/src/routes/$locale/_public/password-recovery/new-password.tsx
apps/webapp/src/routes/$locale/_public/password-recovery/done.tsx
```

### Patrón para mutaciones

Cada ruta usará:

```tsx
const mutate = useAtomSet(action, { mode: "promiseExit" })
const navigate = Route.useNavigate()
const { locale } = Route.useParams()
```

El handler:

1. previene el submit nativo;
2. espera la mutación;
3. comprueba `Exit.isSuccess(exit)`;
4. navega con destino y params tipados;
5. no navega en caso de failure o defect.

### Destinos

| Origen | Éxito/evento | Destino |
| --- | --- | --- |
| Login | iniciar recuperación | `/$locale/password-recovery` |
| Password recovery | solicitar código | `/$locale/password-recovery/code` |
| Recovery code | aceptar código | `/$locale/password-recovery/new-password` |
| New password | restablecer contraseña | `/$locale/password-recovery/done` |
| Recovery/done | volver al login | `/$locale/login` |

### Enlaces simples

Los controles que solo cambian de ruta usarán `Link` cuando `@proxus/ui` permita composición accesible sin markup inválido. Si `Button` no soporta renderizar como enlace, se usará el componente adecuado de UI o `Route.useNavigate()` como solución localizada; no se modificará `@proxus/ui` sin necesidad.

Ejemplos:

- login → crear cuenta;
- registro → iniciar sesión.

## 4. Navegación externa de OAuth

Se mantendrán:

```text
packages/frontend-core/src/navigation/document-navigation.ts
apps/webapp/src/platform/routing/document-navigation.web.ts
```

El archivo ambiguo:

```text
apps/webapp/src/routes/navigation-runtime.ts
```

se moverá o renombrará a:

```text
apps/webapp/src/platform/routing/document-navigation-runtime.ts
```

Se actualizarán los imports desde auth, registro y tests.

Se evaluará proporcionar `DocumentNavigation` mediante el runtime canónico de la aplicación. Solo se eliminará el runtime especializado si el cambio resulta directo y no mezcla lifecycles ni amplía el alcance. No se creará un servicio `SpaNavigation`.

## 5. Registro: enlace a login

Archivo actual:

```text
apps/webapp/src/modules/registration/steps/choosing-method.tsx
```

Se eliminará el uso de `navigateAction`.

La ruta terminal de registro poseerá la navegación TanStack. La integración descendente se resolverá con la interfaz React mínima necesaria, preferiblemente una composición/enlace o un callback visual `onOpenLogin`; no se pasarán atoms ni el router como props.

Un callback React visual es aceptable aquí porque expresa un evento del componente, no una continuación incrustada en una mutación Effect.

## 6. Registro: completar operaciones y navegar a home

Actions afectadas:

- `verifyRegistrationCodeAction`;
- `confirmGoogleRegistrationAction`;
- rama de sesión existente de `resolveGoogleCallbackAction`.

Las actions dejarán de despachar `navigateAction`.

Las superficies React que disparan verificación o confirmación usarán `useAtomSet(..., { mode: "promiseExit" })`. Tras `Exit.Success`, navegarán con TanStack a:

```text
/$locale/app
```

usando `replace: true` donde el comportamiento actual ya lo requiera.

Se preservará el orden:

1. completar operación remota;
2. actualizar sesión y estado de registro;
3. registrar analytics;
4. resolver la mutación;
5. navegar desde React.

Un fallo en cualquiera de los pasos que pertenezcan al contrato actual impedirá la navegación.

## 7. Callback OAuth de registro

El callback OAuth requiere tratamiento separado porque llega tras una navegación completa y se procesa desde la URL.

### Responsabilidades de la ruta

- leer `code` y `state` desde search params de TanStack;
- validar/decodificar esos valores;
- proporcionar identidad estable al lifecycle/action;
- limpiar `code` y `state` mediante navegación `replace`;
- navegar a home si el resultado representa una sesión existente.

### Responsabilidades del atom

- completar el callback remoto;
- deduplicar el callback ya procesado;
- restaurar la transición `GoogleStarted` cuando corresponda;
- actualizar sesión y estado de registro;
- devolver un resultado explícito que permita distinguir:
  - sesión existente;
  - registro nuevo pendiente de confirmación.

No deberá leer directamente el router ni escribir History.

### Lifecycle

El procesamiento automático del callback puede mantenerse como lifecycle porque sincroniza la aplicación con una respuesta OAuth externa presente al montar. Sin embargo, no usará globals ni funciones singleton de navegación. La coordinación exacta se diseñará para no introducir navegación inferida mediante un `useEffect` que observe `AsyncResult`.

Si el lifecycle actual no permite devolver el resultado a la ruta de forma limpia, se extraerá una acción explícita disparada por la ruta con input `{ code, state }`, manteniendo deduplicación en el atom.

## 8. Search params del wizard de registro

Archivo:

```text
apps/webapp/src/platform/registration/wizard-url.ts
```

Se separarán codecs puros de escritura de URL.

### Se conservarán como funciones puras

- `decodeRegistrationQuery(searchValue)`;
- codificación de `step` y `path`;
- preservación de parámetros no relacionados;
- schemas de `RegistrationStepParam` y `RegistrationPathParam`.

### Se eliminarán o sustituirán

- `registrationUrlState()` basado en el router singleton;
- `changeRegistrationStep()` que escribe History indirectamente;
- imports de `routes/navigation.ts`;
- `WebNavigationError` en el codec.

### Autoridad de URL

La ruta de registro leerá search params desde TanStack y escribirá con `Route.useNavigate()`.

El flujo neutral de `frontend-core` no importará TanStack. Se revisará `makeRegistrationFlowAtoms` para desacoplar su callback `navigate` de la escritura directa de URL. La adaptación debe preservar:

- transición de step;
- path del estudio;
- `push`/`replace`;
- back/forward;
- restauración de draft;
- parámetros de campañas y referidos.

No se moverá estado de producto al router ni se usarán loaders, `beforeLoad`, caché o invalidación de TanStack.

## 9. Eliminar la abstracción SPA existente

Cuando todos los consumidores estén migrados, eliminar:

```text
apps/webapp/src/routes/navigation.ts
```

Con ello desaparecerán:

- `NavigationDestination`;
- `WebNavigationError`;
- `navigate`;
- `navigateAction`;
- `currentLocale`;
- `currentSearch`;
- `setSearch`;
- `replaceSearch`.

También se eliminará o reemplazará:

```text
apps/webapp/src/routes/navigation.types.test.ts
```

Los tests sustitutos validarán directamente rutas y navegación tipada de TanStack.

Comprobación final:

```bash
rg "navigation\.js|navigateAction|currentSearch|setSearch|replaceSearch|NavigationDestination|WebNavigationError" apps/webapp/src
```

No deberán quedar consumidores de la abstracción eliminada.

## 10. Tests

### Auth

Cubrir:

- navegación después de mutación exitosa;
- ausencia de navegación tras failure;
- conservación de locale `es`/`en`;
- transición correcta del estado de recuperación;
- enlaces accesibles;
- reset de identidad de campos entre rutas;
- OAuth continúa usando navegación completa del documento.

Se preferirá un router real con `createMemoryHistory` frente a mocks del singleton.

### Registro

Cubrir:

- enlace de registro a login;
- verificación email exitosa → home con replace;
- error de verificación → permanece en la ruta;
- confirmación Google exitosa → home;
- callback de sesión existente → limpia query y navega a home;
- callback de registro nuevo → limpia query y muestra confirmación;
- deduplicación del callback;
- codificación y decodificación de `step` y `path`;
- conservación de query params de atribución;
- semántica push/replace y navegación back/forward.

### Arquitectura

Actualizar `apps/webapp/src/architecture.test.ts` para comprobar:

- TanStack es el único escritor de History SPA;
- `frontend-core` no importa TanStack Router;
- no existe catálogo paralelo de destinos;
- atoms neutrales no acceden a URL ni globals del navegador;
- no hay navegación SPA inferida desde `useEffect`;
- `DocumentNavigation` se limita a navegación externa.

## 11. Documentación

Actualizar:

```text
docs/webapp-architecture.md
docs/effect/90_react_and_effect_atom.md
docs/architecture/atom-first-frontend.md
```

Eliminar las reglas que actualmente obligan a usar `apps/webapp/src/routes/navigation.ts` o describen toda navegación como servicio Effect.

Documentar:

- TanStack Router posee navegación SPA y URL;
- `Link` es preferible para navegación interactiva;
- `Route.useNavigate()` se usa tras eventos y mutaciones exitosas;
- `useAtomSet(atom, { mode: "promiseExit" })` permite esperar una mutación sin callbacks de UI en el atom;
- `Exit.isSuccess` controla la navegación posterior;
- `useEffect` no observa resultados para decidir navegación;
- `DocumentNavigation` se reserva para abandonar la SPA.

## 12. Orden de implementación

1. Añadir/ajustar pruebas de caracterización de auth, registro, OAuth y URL.
2. Hacer puros los codecs de `wizard-url.ts`.
3. Mover y renombrar el runtime de `DocumentNavigation`.
4. Sacar navegación SPA de las actions de auth.
5. Migrar rutas de auth a `promiseExit` + `Route.useNavigate()`/`Link`.
6. Migrar el enlace de registro a login.
7. Sacar navegación a home de verificación y confirmación de registro.
8. Adaptar el callback OAuth y limpieza de search params.
9. Transferir la sincronización del wizard a TanStack Router.
10. Eliminar `routes/navigation.ts` y sus tests obsoletos.
11. Actualizar tests arquitectónicos.
12. Actualizar documentación normativa.
13. Ejecutar validación proporcional y global.

## 13. Riesgos y mitigaciones

### Resultado de mutaciones concurrentes

`useAtomSet(..., { mode: "promiseExit" })` espera el resultado del `AtomResultFn`. Los formularios actuales evitan submits paralelos mediante estado `waiting`. Se verificará que ninguna action migrada use `concurrent: true` ni pueda ser disparada simultáneamente desde múltiples superficies.

### Errores y defects

Se usará `promiseExit`, no `promise`, para evitar convertir causas tipadas en excepciones mediante `Cause.squash`. Solo `Exit.Success` permitirá navegar.

### URL frente a estado de producto

TanStack será autoridad de URL; Effect Atom seguirá siendo autoridad del workflow. No se duplicará el estado completo del registro en search params ni se copiará la URL a un atom sin necesidad.

### OAuth y Strict Mode

El callback debe seguir deduplicado y tolerar montajes repetidos. Se mantendrá una identidad estable basada en `code:state` y se probará el comportamiento.

### Atribución

Al modificar `step` y `path`, los demás search params deben conservarse. Al limpiar OAuth solo se eliminarán `code` y `state`.

### Accesibilidad

Los enlaces deben conservar semántica de enlace, apertura en nueva pestaña cuando sea aplicable y navegación por teclado. No se anidará un `<a>` dentro de un `<button>`.

## 14. Criterios de aceptación

- No existe `apps/webapp/src/routes/navigation.ts`.
- No existe `navigateAction` ni un union paralelo de destinos SPA.
- La navegación interna usa APIs tipadas de TanStack Router.
- Las mutaciones navegables se esperan con `mode: "promiseExit"`.
- Los atoms no reciben callbacks de navegación.
- Un fallo de mutación no navega.
- OAuth externo continúa usando `DocumentNavigation`.
- `frontend-core` no depende de TanStack ni del navegador.
- El wizard conserva locale, query de atribución, push/replace y back/forward.
- No se introducen loaders, `beforeLoad`, caché del router ni navegación mediante `useEffect`.
- Tests y documentación reflejan la arquitectura real.

## 15. Validación

Validación enfocada:

```bash
pnpm --filter @proxus/frontend-core typecheck
pnpm --filter @proxus/frontend-core test
pnpm --filter @proxus/webapp typecheck
pnpm --filter @proxus/webapp test
pnpm --filter @proxus/webapp build
```

Validación Effect y global:

```bash
pnpm effect:diagnostics
pnpm static
pnpm test
pnpm build
```

Al finalizar se informará del resultado de cada comando, advertencias existentes y cualquier comprobación no ejecutada.
