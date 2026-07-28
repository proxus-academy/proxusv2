# Plan de refactor: router de producto y límites mediante layouts

## Objetivo

Corregir dos problemas relacionados:

1. El router se llama `PublicRouter`, aunque contiene rutas para visitantes y rutas autenticadas.
2. La vista decide el límite de acceso a partir del ID terminal (`home` frente al resto), en lugar de usar la jerarquía de layouts declarada por el contrato de rutas.

La estructura objetivo es:

```text
Router
└── locale
    └── product
        ├── public-only
        │   ├── registration
        │   ├── login
        │   └── password-recovery-flow
        └── authenticated
            └── home
```

`public-only` y `authenticated` expresan límites estructurales. Sus componentes React implementan la consulta de sesión, los estados de carga/error y la redirección correspondiente.

## Decisiones

### 1. “Public” no describe al router

El router completo pasará a llamarse `Router`. Dentro de él habrá un `PublicOnlyLayout` y un `AuthenticatedLayout`.

```ts
// Antes
PublicRouter
publicRouterRuntime
PublicRouterPage
usePublicRouter

// Después
Router
routerRuntime
AppRoutes
useRouter
```

### 2. La definición de rutas declara los layouts, pero no consulta la sesión

`frontend-core` describe la estructura neutral de plataforma:

```text
public-only → login
public-only → registration
authenticated → home
```

La aplicación React implementa qué significa cada layout. `frontend-core` no importa React, atoms de sesión ni adapters web.

### 3. La route view consume la cadena reconocida

Actualmente `RouterService.current` expone solo `RouteDestination`, mientras `CompiledRoutes.decode` ya produce:

```ts
interface DecodedRoute<Destination, Match> {
  readonly destination: Destination
  readonly matches: readonly Match[]
}
```

Para no volver a inferir layouts desde el ID terminal, la API observable del router debe conservar los matches reconocidos. Este cambio se realizará en la API neutral del router y en sus adapters, no mediante un segundo parser en React.

### 4. Separar configuración de routing y política de autenticación

`apps/web/src/routes/router.ts` será el composition root del routing. Los guards de sesión estarán en `apps/web/src/modules/auth/route-guards.ts`.

---

## Alcance por capas

```text
- contrato compartido/API HTTP: no
- persistencia y repositories: no
- services/casos de uso backend: no
- handlers HTTP: no
- frontend core/atoms: sí
- adapters frontend web: sí
- UI, pantallas y rutas: sí
- tests y fixtures: sí
- documentación: sí
```

No se modificarán backend, persistencia ni contratos HTTP.

---

# Fase 1 — Ampliar la API neutral del router

## Archivos

```text
packages/frontend-core/src/routing/index.ts
packages/frontend-core/src/routing/index.test.ts
packages/frontend-web/src/routing/browser-router.ts (o archivo equivalente)
packages/frontend-web/src/routing/browser-router.test.ts
```

## API propuesta

Introducir una ubicación reconocida que conserve destino y matches:

```ts
export interface RouterMatchState<
  Destination extends RouteDestination,
  Match extends RouteMatch = RouteMatch,
> {
  readonly destination: Destination
  readonly matches: readonly Match[]
}

export interface RouterLocation<
  Destination extends RouteDestination,
  Match extends RouteMatch = RouteMatch,
> extends RouterMatchState<Destination, Match> {
  /** Query codificada sin `?`. */
  readonly search: string
}
```

El servicio expondrá el estado reconocido completo:

```ts
export interface RouterService<
  Destination extends RouteDestination,
  ContextKey extends string = never,
  Match extends RouteMatch = RouteMatch,
> {
  /** Proyección conveniente del destino terminal. */
  readonly current: Atom.Atom<Destination>

  /** Destino terminal, cadena de matches y query de una misma transición. */
  readonly location: Atom.Atom<RouterLocation<Destination, Match>>

  // navigate, replace, back, forward...
}
```

Se mantiene `current` por compatibilidad y ergonomía. La route view leerá `location.matches`; no se crea otro atom que vuelva a decodificar `window.location`.

Ejemplo de valor:

```ts
{
  destination: {
    id: "login",
    params: { locale: "es" },
    query: {},
  },
  matches: [
    { id: "root", params: {} },
    { id: "locale", params: { locale: "es" } },
    { id: "product", params: { locale: "es" } },
    { id: "public-only", params: { locale: "es" } },
    { id: "login", params: { locale: "es" } },
  ],
  search: "",
}
```

## Cambios en adapters

El browser adapter debe guardar en una sola celda coherente:

```ts
interface RouterState<Destination, Match> {
  readonly location: RouterLocation<Destination, Match>
  readonly error: RouterObservableError | undefined
}
```

Al decodificar una URL:

```ts
const decoded = yield* routes.decode(url.pathname, url.search)

state.set({
  location: {
    destination: decoded.destination,
    matches: decoded.matches,
    search: encodedSearch,
  },
  error: undefined,
})
```

Para navegación construida desde un destino, el adapter debe obtener los matches mediante una operación neutral del contrato compilado. Se añadirá una API explícita, evitando fabricar matches a mano:

```ts
export interface RouterRoutes<Destination, Match> {
  readonly decode: (
    pathname: string,
    search: string,
  ) => Effect.Effect<DecodedRoute<Destination, Match>, RouteDecodeError>

  readonly matchDestination: (
    destination: Destination,
  ) => Effect.Effect<readonly Match[], RouteConfigurationError>

  // encodeQuery, makeDestination...
}
```

Antes de fijar la firma exacta, se reutilizará la lógica interna del compilador que ya construye `DecodedRoute.matches`. No se duplicará el recorrido del árbol.

## Pruebas

- `memoryRouterLayer` conserva matches iniciales y tras `navigate`/`replace`.
- `browserRouterLayer` conserva matches en carga inicial, `push`, `replace` y `popstate`.
- `current` sigue siendo una proyección pura de `location.destination`.
- Una transición actualiza destino, matches y query de manera atómica.
- Los errores no dejan destino y matches pertenecientes a URLs diferentes.

---

# Fase 2 — Declarar los límites en el contrato de rutas

## Archivo

```text
packages/frontend-core/src/public-product/routing.ts
packages/frontend-core/src/public-product/routing.test.ts (nuevo o existente)
```

Por ahora se conserva el subpath público `@proxus/frontend-core/public-product` para evitar mezclar un movimiento de paquete con el cambio funcional. Se renombran los símbolos exportados; el movimiento físico puede hacerse al final.

## Definición propuesta

```ts
export const productRouteDefinition = root({
  id: "root",
  children: [
    param({
      id: "locale",
      name: "locale",
      schema: Locale,
      children: [
        layout({
          id: "product",
          children: [
            layout({
              id: "public-only",
              children: [
                index({ id: "registration" }),
                path({ id: "login", path: "login" }),
                path({
                  id: "password-recovery-flow",
                  path: "password-recovery",
                  children: [
                    index({ id: "password-recovery" }),
                    path({ id: "password-recovery-code", path: "code" }),
                    path({ id: "new-password", path: "new-password" }),
                    path({ id: "password-updated", path: "done" }),
                  ],
                }),
              ],
            }),
            layout({
              id: "authenticated",
              children: [
                path({ id: "home", path: "app" }),
              ],
            }),
          ],
        }),
      ],
    }),
  ],
})

export const productRoutes = compile(productRouteDefinition)
export type ProductDestination = DestinationOf<typeof productRouteDefinition>
export type ProductRouteMatch = MatchOf<typeof productRouteDefinition>

export const makeRouterService = (identifier: string) =>
  makeRouterService<ProductDestination, "locale", ProductRouteMatch>(identifier)
```

Las URLs no cambian:

| URL | Terminal | Layout de acceso |
| --- | --- | --- |
| `/es` | `registration` | `public-only` |
| `/es/login` | `login` | `public-only` |
| `/es/password-recovery` | `password-recovery` | `public-only` |
| `/es/password-recovery/code` | `password-recovery-code` | `public-only` |
| `/es/password-recovery/new-password` | `new-password` | `public-only` |
| `/es/password-recovery/done` | `password-updated` | `public-only` |
| `/es/app` | `home` | `authenticated` |

## Migración de nombres sin aliases

No se introducirán aliases deprecados. Los símbolos anteriores se renombran en origen y todos sus consumidores se actualizan en el mismo refactor:

```text
publicProductRouteDefinition   → productRouteDefinition
publicAppRoutes            → productRoutes
PublicProductDestination       → ProductDestination
makePublicRouterService → makeRouterService
```

Para que el cambio mecánico no bloquee el trabajo arquitectónico, se delegarán búsquedas y renames independientes a subagentes ligeros `openai-codex/gpt-5.6-luna`, repartidos por superficie:

```text
subagente 1 → packages/frontend-core
subagente 2 → packages/frontend-web
subagente 3 → apps/web
subagente 4 → apps/mobile-web
```

Cada subagente deberá limitarse a los renames asignados y reportar archivos modificados y validación. El agente principal integrará los resultados, resolverá cambios en tipos y ejecutará la validación transversal. No se conservarán exports con los nombres antiguos.

## Pruebas

```ts
it("matches login through public-only", async () => {
  const decoded = await Effect.runPromise(productRoutes.decode("/es/login", ""))

  expect(decoded.destination.id).toBe("login")
  expect(decoded.matches.map(({ id }) => id)).toEqual([
    "root",
    "locale",
    "product",
    "public-only",
    "login",
  ])
})

it("matches home through authenticated", async () => {
  const decoded = await Effect.runPromise(productRoutes.decode("/es/app", ""))

  expect(decoded.destination.id).toBe("home")
  expect(decoded.matches.map(({ id }) => id)).toContain("authenticated")
})
```

---

# Fase 3 — Renombrar y adelgazar el composition root de web

## Renombre

```text
apps/web/src/routes/public-router.ts
→ apps/web/src/routes/router.ts
```

## Responsabilidad final

Este archivo contendrá:

- `Router` y su `ManagedRuntime`;
- browser router/document layers;
- locale y canonicalización;
- comandos reintentables de navegación;
- navegación URL del wizard de registro;
- atoms observables del router;
- cleanup del runtime.

No contendrá guards de sesión.

## API propuesta

```ts
const navigation = makeRetryableCommands()

export const Router =
  makeProductRouterService("@proxus/web/Router")

const managedRouterRuntime = ManagedRuntime.make(
  browserRouterLayer<ProductDestination, "locale", ProductRouteMatch>(
    Router,
    productRoutes,
    {
      notFound: fallback,
      contextParameters: ["locale"],
    },
  ),
)

export const router =
  await managedRouterRuntime.runPromise(Router)

export const routerRuntime = Atom.runtime(
  Layer.merge(
    Layer.succeed(Router, router),
    browserDocumentNavigationLayer(),
  ),
)

export const currentDestinationAtom = router.current
export const routeLocationAtom = router.location
export const routeErrorAtom = router.error

export const runNavigation = navigation.run
export const navigationFailedAtom = navigation.failedAtom
export const retryNavigationAction = navigation.retryAtom

export const disposeRouter = () => managedRouterRuntime.dispose()
```

`currentRouteAtom`, que elimina parámetros y estructura demasiado pronto, dejará de ser la fuente de la route view. Puede eliminarse si no quedan consumidores.

## Exports internos

`router` y `runNavigation` se exportarán solo para construir operaciones de aplicación como guards. Las vistas normales seguirán usando bindings/actions concretos, no el servicio imperativo directamente.

---

# Fase 4 — Mover los guards al módulo de autenticación

## Archivo nuevo

```text
apps/web/src/modules/auth/route-guards.ts
```

## Contenido

```ts
import { currentSessionQuery } from "@proxus/frontend-core/auth"
import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import {
  router,
  runNavigation,
} from "../../routes/router.js"

export const authenticatedRouteLifecycleAtom = Atom.make((get) => {
  const session = get(currentSessionQuery)

  return session._tag === "Success" && session.value === null
    ? runNavigation(get, router.replace("login"))
    : Effect.void
})

export const publicOnlyRouteLifecycleAtom = Atom.make((get) => {
  const session = get(currentSessionQuery)

  return session._tag === "Success" && session.value !== null
    ? runNavigation(get, router.replace("home"))
    : Effect.void
})
```

Los guards:

- no navegan mientras la sesión está cargando;
- no convierten un fallo de sesión en una redirección engañosa;
- usan `replace`, para no dejar la ruta prohibida en el historial;
- pasan por el runner reintentable compartido.

## Pruebas nuevas

```text
apps/web/src/modules/auth/route-guards.test.ts
```

Casos:

1. Visitante en `authenticated` ejecuta `replace("login")`.
2. Usuario autenticado en `public-only` ejecuta `replace("home")`.
3. `Waiting` no navega.
4. `Failure` no navega.
5. Un fallo de navegación queda disponible mediante `navigationFailedAtom`.

---

# Fase 5 — Colocar los componentes layout en auth

## Renombre

```text
apps/web/src/routes/auth-layouts.tsx
→ apps/web/src/modules/auth/layouts.tsx
```

## API

```tsx
interface AccessLayoutProps {
  readonly children: ReactNode
}

export function PublicOnlyLayout({ children }: AccessLayoutProps) {
  useAtomValue(publicOnlyRouteLifecycleAtom)
  const session = useAtomValue(currentSessionQuery)

  if (session._tag !== "Success") return null
  return session.value === null ? children : null
}

export function AuthenticatedLayout({ children }: AccessLayoutProps) {
  useAtomValue(authenticatedRouteLifecycleAtom)
  const session = useAtomValue(currentSessionQuery)

  if (session._tag === "Failure") {
    return (
      <main>
        <Heading level={1}>No hemos podido comprobar tu sesión</Heading>
        <Text role="alert">Inténtalo de nuevo.</Text>
      </main>
    )
  }

  if (session._tag !== "Success") {
    return (
      <main aria-busy="true">
        <Heading level={1}>Comprobando tu sesión…</Heading>
      </main>
    )
  }

  return session.value === null ? null : children
}
```

Decisión explícita: `PublicOnlyLayout` puede seguir sin mostrar loading para evitar un flash del formulario de login. Si producto desea feedback durante la restauración de sesión, se añadirá un estado visual explícito y una prueba; no forma parte de este refactor.

---

# Fase 6 — Hacer que `AppRoutes` respete los layouts declarados

## Qué problema resuelve

Hoy `public-router-page.tsx` contiene esta regla implícita:

```tsx
// "home" se considera autenticada.
Match.when("home", () => (
  <AuthenticatedLayout><HomePage /></AuthenticatedLayout>
))

// Cualquier otra ruta se considera pública.
Match.orElse((publicPage) => (
  <PublicOnlyLayout>{/* página */}</PublicOnlyLayout>
))
```

Esto obliga a conocer la política de acceso mirando el nombre de la página. Si mañana aparece otra página autenticada, alguien debe recordar añadir otra excepción.

Después de la fase 2, el router ya habrá reconocido explícitamente una cadena como:

```text
/es/login → root → locale → product → public-only → login
/es/app   → root → locale → product → authenticated → home
```

Esta fase cambia únicamente la traducción de ese resultado a React:

```text
1. El destino terminal `login` selecciona <LoginPage />.
2. El match `public-only` envuelve esa página con <PublicOnlyLayout>.
```

Resultado:

```tsx
<PublicOnlyLayout>
  <LoginPage />
</PublicOnlyLayout>
```

Para `/es/app`:

```tsx
<AuthenticatedLayout>
  <HomePage />
</AuthenticatedLayout>
```

Por tanto, “renderizar terminales y layouts por separado” no significa crear dos routers ni dos árboles de rutas. Significa separar dos preguntas dentro del mismo componente:

- **¿Qué página terminal corresponde al destino?** `renderTerminal`.
- **¿Qué wrappers declarados deben rodearla?** `applyLayout`.

## Renombre del archivo

```text
apps/web/src/routes/public-router-page.tsx
→ apps/web/src/routes/app-routes.tsx
```

## Implementación propuesta

La route view tendrá dos funciones puras:

1. `renderTerminal`: destino terminal → página.
2. `applyLayout`: match estructural → wrapper React.

```tsx
import { useAtomValue } from "@effect/atom-react"
import type { ProductDestination, ProductRouteMatch } from "@proxus/frontend-core/public-product"
import { Match } from "effect"
import type { ReactNode } from "react"
import { AuthenticatedLayout, PublicOnlyLayout } from "../modules/auth/layouts.js"
import { routeLocationAtom } from "./router.js"

function renderTerminal(destination: ProductDestination): ReactNode {
  return Match.value(destination).pipe(
    Match.when({ id: "registration" }, () => <RegistrationPage />),
    Match.when({ id: "login" }, () => <LoginPage />),
    Match.when({ id: "password-recovery" }, () => <PasswordRecoveryPage />),
    Match.when({ id: "password-recovery-code" }, () => <RecoveryCodePage />),
    Match.when({ id: "new-password" }, () => <NewPasswordPage />),
    Match.when({ id: "password-updated" }, () => <PasswordUpdatedPage />),
    Match.when({ id: "home" }, () => <HomePage />),
    Match.exhaustive,
  )
}

function applyLayout(match: ProductRouteMatch, children: ReactNode): ReactNode {
  switch (match.id) {
    case "public-only":
      return <PublicOnlyLayout>{children}</PublicOnlyLayout>
    case "authenticated":
      return <AuthenticatedLayout>{children}</AuthenticatedLayout>
    default:
      return children
  }
}

export function AppRoutes() {
  const location = useAtomValue(routeLocationAtom)

  return location.matches.reduceRight<ReactNode>(
    (children, match) => applyLayout(match, children),
    renderTerminal(location.destination),
  )
}
```

### Por qué `reduceRight`

Para estos matches:

```ts
["root", "locale", "product", "public-only", "login"]
```

se empieza por `<LoginPage />` y se envuelve desde el match más interno hacia fuera:

```tsx
<PublicOnlyLayout>
  <LoginPage />
</PublicOnlyLayout>
```

Los matches estructurales sin componente (`root`, `locale`, `product`) devuelven los hijos sin cambios.

### Exhaustividad de layouts

El `default` es necesario porque terminales y nodos estructurales comparten `ProductRouteMatch`. Para evitar que un layout nuevo quede ignorado, se añadirá un conjunto tipado de IDs renderizables o una prueba contractual:

```ts
const renderedLayoutIds = ["public-only", "authenticated"] as const
```

La prueba comparará estos IDs con los layouts declarados que requieren representación. Si la API de routing puede exponer `kind: "layout"` en `RouteMatch` sin acoplarse a React, se preferirá una unión discriminada y `Match.exhaustive`.

---

# Fase 7 — Renombrar el binding React de navegación

## Renombre

```text
apps/web/src/routes/use-public-router.ts
→ apps/web/src/routes/use-router.ts
```

## API

```ts
const navigateProductRoute = routerRuntime.fn(
  (id: ProductDestination["id"]) =>
    Effect.gen(function*() {
      const router = yield* Router
      yield* router.navigate(id)
    }),
)

/** Binding para destinos sin path/query aportados por el caller. */
export const useRouter = () => ({
  navigate: useAtomSet(navigateProductRoute),
})
```

Actualizar consumidores:

```text
apps/web/src/pages/auth/login-page.tsx
apps/web/src/modules/registration/steps/choosing-method.tsx
```

Los workflows Effect seguirán obteniendo `Router` desde su Layer; no usarán hooks React.

---

# Fase 8 — Actualizar composición y consumidores

## Archivos de `apps/web`

```text
apps/web/src/App.tsx
apps/web/src/main.tsx
apps/web/src/modules/auth/actions.ts
apps/web/src/modules/registration/state.ts
apps/web/src/bootstrap.test.ts
```

Ejemplo de `App.tsx`:

```tsx
import { useAtomValue } from "@effect/atom-react"
import { localeLifecycleAtom } from "./routes/router.js"
import { AppRoutes } from "./routes/app-routes.js"

export function App() {
  useAtomValue(localeLifecycleAtom)
  return <AppRoutes />
}
```

Ejemplo de cleanup en `main.tsx`:

```ts
import { disposeRouter } from "./routes/router.js"

hot?.dispose(() => {
  reactRoot.unmount()
  void disposeRouter()
})
```

Actualizar en acciones/workflows:

```ts
// Antes
import { PublicRouter, publicRouterRuntime } from "../../routes/public-router.js"

// Después
import { Router, routerRuntime } from "../../routes/router.js"
```

## Composición compartida y mobile-web

Archivos:

```text
packages/frontend-web/src/public-product/composition.web.ts
packages/frontend-web/src/public-product/index.ts
apps/mobile-web/src/composition.ts
apps/mobile-web/src/composition.test.ts
```

Cambios de símbolos:

```ts
PublicWebProductCompositionOptions → WebProductCompositionOptions
makePublicWebProductComposition → makeWebProductComposition
```

Uso objetivo:

```ts
import { makeWebProductComposition } from "@proxus/frontend-web/public-product"

export const composition = await Effect.runPromise(
  makeWebProductComposition({
    routerIdentifier: "@proxus/mobile-web/Router",
  }),
)
```

Esta composición también deberá parametrizar `ProductRouteMatch` al construir el browser router y exponer la nueva `location.matches`.

---

# Fase 9 — Renombre opcional del subpath compartido

Solo después de que el cambio funcional esté verde:

```text
packages/frontend-core/src/public-product
→ packages/frontend-core/src/product

packages/frontend-web/src/public-product
→ packages/frontend-web/src/product
```

Exports:

```json
{
  "exports": {
    "./product": "./src/product/index.ts"
  }
}
```

Imports objetivo:

```ts
import {
  makeRouterService,
  productRoutes,
  type ProductDestination,
  type ProductRouteMatch,
} from "@proxus/frontend-core/product"

import {
  makeWebProductComposition,
} from "@proxus/frontend-web/product"
```

Recomendación: hacer este movimiento en un commit separado. Se migrarán todos los consumidores del workspace en el mismo cambio y se eliminará `./public-product`, sin reexports ni aliases de compatibilidad. Antes de hacerlo se comprobará que no existan consumidores externos que obliguen a tratarlo como un cambio mayor de API.

---

# Documentación a actualizar

## `docs/webapp-architecture.md`

Precisar que:

- `RouterLocation` conserva destino, query y cadena de matches coherentes;
- la route view renderiza la página terminal y pliega los layouts reconocidos;
- los límites de autenticación se declaran como layouts, no se infieren mediante IDs terminales;
- los layouts implementan guards usando atoms y el Router service.

Snippet normativo propuesto:

```text
route definition
  → decoded destination + match chain
  → route view renders terminal page
  → route view folds matched layouts
  → access layout observes session and performs typed replace when required
```

## `docs/architecture/atom-first-frontend.md`

La regla existente ya dice que un route module selecciona “la página terminal y sus layouts”. Añadir un ejemplo con `reduceRight` o enlazar al patrón implementado, evitando convertirlo en una abstracción genérica prematura.

---

# Estrategia de commits

1. **Router API:** conservar matches en `RouterLocation`; memory/browser tests.
2. **Route contract:** añadir `public-only` y `authenticated`; contract tests.
3. **Web composition:** renombrar `PublicRouter` a `Router` y mover guards.
4. **React routing:** crear `AppRoutes` y renderizar la cadena de layouts.
5. **Shared composition:** migrar `frontend-web` y `mobile-web`.
6. **Naming cleanup:** mover `public-product` a `product`, si se aprueba ese alcance.
7. **Docs y validación final.**

Cada commit debe compilar por sí mismo cuando sea práctico. Como no habrá aliases temporales, los renames de símbolos compartidos y sus consumidores se integrarán juntos. Los subagentes ligeros pueden preparar cambios por superficie en paralelo, pero el agente principal no cerrará el commit hasta que todo el workspace use los nombres nuevos.

---

# Criterios de aceptación

- No existe un router llamado `PublicRouter` que incluya rutas autenticadas.
- `/es/login` conserva la misma URL y se renderiza bajo `PublicOnlyLayout`.
- `/es/app` conserva la misma URL y se renderiza bajo `AuthenticatedLayout`.
- La route view no contiene la regla `home → autenticado; resto → público`.
- La pertenencia a layouts procede de la definición compilada de rutas.
- El browser adapter sigue siendo el único propietario de History y `popstate`.
- Destino, matches y query se actualizan coherentemente en cada transición.
- Los guards no acceden a `window`, no construyen paths y usan navegación tipada.
- Añadir una ruta terminal sin página produce un error de tipos por el match exhaustivo.
- Añadir un layout de acceso sin renderer falla en una prueba contractual o por exhaustividad tipada.
- Web y mobile-web siguen usando identidades de Router distintas.
- No cambian contratos HTTP ni URLs públicas.

---

# Validación

Durante el desarrollo:

```bash
pnpm --filter @proxus/frontend-core typecheck
pnpm --filter @proxus/frontend-core test

pnpm --filter @proxus/frontend-web typecheck
pnpm --filter @proxus/frontend-web test

pnpm --filter @proxus/web typecheck
pnpm --filter @proxus/web test

pnpm --filter @proxus/mobile-web typecheck
pnpm --filter @proxus/mobile-web test
```

Por el cambio en tipos Effect y API transversal:

```bash
pnpm effect:diagnostics
pnpm static
pnpm test
pnpm build
```

Gate final recomendado:

```bash
pnpm validate:pr
```

No se requieren PostgreSQL ni Docker para este refactor. Al finalizar se documentarán los comandos ejecutados, sus resultados y cualquier validación omitida.

---

# Riesgos y mitigaciones

## Riesgo: extender genéricos del Router produce un diff amplio

Mitigación: dar a `Match` un parámetro por defecto (`RouteMatch`) y conservar `current`. Así los consumidores que no necesitan matches continúan compilando con cambios mínimos.

## Riesgo: destino y matches incoherentes tras navegación programática

Mitigación: una sola celda de estado y una sola función de transición construyen `RouterLocation`; tests para push, replace, back, forward y popstate.

## Riesgo: duplicar el árbol en el renderer React

Mitigación: el árbol vive solo en `productRouteDefinition`. React únicamente mapea IDs de página a componentes e IDs de layout a wrappers.

## Riesgo: confundir “producto público” con “ruta pública” durante la migración

Mitigación: usar `Product*` para la aplicación/router y reservar `PublicOnly*` exclusivamente para el límite de acceso de visitantes.

## Riesgo: mezclar refactor funcional con movimiento de paquetes

Mitigación: mantener inicialmente el subpath `./public-product` y ejecutar el movimiento a `./product` como fase/commit opcional separado.
