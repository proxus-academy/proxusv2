# Plan: router SPA tipado basado en Effect y Effect Atom

## Estado del documento

Plan aprobado para implementación incremental.

La Fase 1 comenzó el 2026-07-30 con un prototipo type-only en
`@proxus/effect-router`. Ese mismo día se implementó y migró el baseline usado
por `apps/web`: matching anidado, params y search con Schema, History web y
memoria, ubicación serializable, match derivado, navegación Effect/Atom,
`RouterProvider`, `Outlet`, `Link`, `Navigate`, fallbacks y error boundary.
TanStack Router, su plugin y el árbol generado se retiraron de `apps/web`.

Continúan pendientes las capacidades avanzadas del alcance completo: blockers,
scroll restoration, base path configurable, lazy routes, ordering/cancelación
de transiciones asíncronas, journal de debugging y snapshots coordinados de
todos los atoms durables de producto.

La intención es acordar primero:

- el alcance exacto del router;
- su interfaz pública;
- las garantías de tipos;
- el modelo de estado, serialización e hidratación;
- la integración con React y el navegador;
- la estrategia de migración desde TanStack Router.

Una vez aprobado este plan, las decisiones aceptadas deben trasladarse a la
documentación normativa correspondiente antes o durante la implementación.

## Motivación

`apps/web` usa actualmente TanStack Router como propietario de URL, History,
matching, layouts y navegación. El estado de aplicación y los workflows viven
principalmente en Effect Atom, pero el routing mantiene un runtime y un modelo
de estado externos al `AtomRegistry`.

Queremos evaluar la sustitución de TanStack Router por un router SPA pequeño que:

1. conserve una definición de árbol tan sencilla como la de React Router;
2. ofrezca type safety completo para params, search params, componentes, enlaces
   y navegación programática;
3. decodifique la URL mediante Effect Schema antes de renderizar una ruta;
4. implemente parsing, matching y transiciones con Effect;
5. represente el estado observable de routing mediante Effect Atom;
6. permita serializar e hidratar el estado durable de la aplicación;
7. no introduzca loaders, caché de datos, actions HTTP ni SSR;
8. mantenga los datos remotos, formularios y workflows de producto en sus
   módulos Effect Atom actuales.

La motivación no es únicamente cambiar la sintaxis. El nuevo módulo debe aportar
profundidad: detrás de una interfaz pequeña debe concentrar matching, validación,
navegación, integración con History, observabilidad, testing determinista e
hidratación. Si esa profundidad no se demuestra en el prototipo, se conservará
TanStack Router.

## Decisiones de alcance

### Incluido

- SPA de navegador.
- Árbol de rutas anidadas.
- Rutas con path, layouts sin path e index routes.
- Segmentos estáticos y parámetros dinámicos.
- Search params y hash.
- Params y search params decodificados con Effect Schema.
- Matching y ranking deterministas.
- `<RouterProvider>`, `<Outlet>`, `<Link>` y `<Navigate>`.
- Navegación `push`, `replace`, `back` y `forward`.
- Eventos `popstate`.
- Redirecciones internas.
- Not found y URL inválida.
- Cancelación y orden de transiciones concurrentes.
- Bloqueo de navegación para cambios sin guardar.
- Restauración de scroll.
- Base path.
- Carga lazy de código de rutas.
- Adapter de navegador y adapter en memoria.
- Estado observable mediante Effect Atom.
- Estado durable serializable, versionado e hidratable.
- Herramientas mínimas de inspección para ubicación, matches y transición actual.

### Excluido

- SSR, streaming y React Server Components.
- Loaders y actions del router.
- Caché o invalidación de datos remotos.
- Formularios propios del router.
- Mutaciones HTTP.
- Prefetch de datos de producto.
- Revalidación de recursos.
- Reproducción de fibers en ejecución.
- Restauración exacta de la pila nativa de `window.history`.

Los datos remotos, mutaciones, formularios y workflows continúan perteneciendo a
Effect Atom y Effect Form.

## Principios de diseño

### Un único propietario de URL e History

El nuevo router será el único propietario de la URL SPA y de la interacción con
`window.history`. No coexistirá en producción con TanStack Router ni habrá dos
estados de ubicación sincronizados.

### Una interfaz pequeña

La interfaz React inicial tendrá solamente estos conceptos:

```text
createRouter
RouterProvider
Outlet
Link
Navigate
useRouteParams
useRouteSearch
```

La interfaz Effect expondrá:

```text
Router.navigate
Router.replace
Router.back
Router.forward
Router.block
```

No se crearán comandos distintos para cada destino.

### Rutas como contratos, no como recursos

Una ruta describe:

- qué URL coincide;
- cómo se decodifican sus entradas;
- qué módulo React se renderiza;
- qué hijos puede seleccionar.

Una ruta no consulta sesiones ni datos de producto. Los layouts y módulos de
feature leen sus atoms y muestran sus estados explícitamente.

### Incertidumbre refinada en seams

El matcher transforma texto no fiable de la URL en params y search params
válidos antes de renderizar el módulo de ruta.

Los layouts de autenticación transforman `AsyncResult<CurrentSession | null>` en
una rama de error, redirect o sesión requerida antes de renderizar su
`<Outlet>`. El router no incorpora conocimiento de autenticación.

### Estado fuente mínimo

Se serializa el estado fuente durable. Los valores que pueden recalcularse se
modelan mediante atoms derivados y no se duplican en el snapshot.

## Interfaz propuesta

### Creación del router

```tsx
export const applicationRouter = createRouter([
  {
    path: ":locale",
    params: {
      locale: Locale,
    },
    Component: LocaleRoute,
    children: [
      {
        id: "login",
        path: "login",
        Component: LoginRoute,
      },
      {
        Layout: AuthenticatedLayout,
        children: [
          {
            id: "home",
            path: "app",
            Component: HomeRoute,
          },
          {
            id: "study",
            path: "studies/:studyId",
            params: {
              studyId: StudyId,
            },
            search: Schema.Struct({
              tab: Schema.optional(
                Schema.Literal("summary", "participants"),
              ),
            }),
            Component: ({ params, search }) => (
              <StudyPage
                studyId={params.studyId}
                tab={search.tab}
              />
            ),
          },
        ],
      },
    ],
  },
])
```

El árbol admite tres tipos de nodo y ninguna combinación ambigua:

```ts
type RouteNode =
  | PathRouteNode
  | LayoutRouteNode
  | IndexRouteNode
```

Sus invariantes son:

- una `PathRouteNode` siempre tiene `path`;
- una `LayoutRouteNode` siempre tiene `Layout` y `children`, y nunca `path`;
- una `IndexRouteNode` tiene `index: true`, y nunca `path` ni `children`;
- `id` es obligatorio para destinos navegables y opcional para nodos puramente
  estructurales;
- los IDs navegables son únicos en todo el árbol.

Ejemplo de index route:

```tsx
{
  index: true,
  Component: RegistrationRoute,
}
```

### Props de rutas

El componente inline se tipa contextualmente a partir de los schemas:

```tsx
{
  path: "studies/:studyId",
  params: {
    studyId: StudyId,
  },
  search: StudySearch,
  Component: ({ params, search }) => {
    // params.studyId: StudyId
    // search: Schema.Type<typeof StudySearch>
    return null
  },
}
```

Los módulos de ruta reciben únicamente los params declarados localmente. Los
params heredados se conservan en el match completo y se exigen al construir una
navegación, pero no se añaden implícitamente a las props de todos los
descendientes.

Un layout que introduce `locale` lo convierte en identidad o metadata
estructural para su rama. Esto evita acoplar cada página a su posición exacta en
el árbol.

Se investigará una forma ergonómica de tipar componentes nombrados sin repetir
el contrato. La opción inicial es:

```tsx
const studyRoute = defineRoute({
  id: "study",
  path: "studies/:studyId",
  params: {
    studyId: StudyId,
  },
  search: StudySearch,
})

export const StudyRoute = studyRoute.component(
  ({ params, search }) => (
    <StudyPage studyId={params.studyId} tab={search.tab} />
  ),
)
```

`defineRoute` no se incorporará a la interfaz final si el prototipo demuestra
que añade más complejidad de la que elimina.

### Navegación

React:

```tsx
<Link
  to="study"
  params={{
    locale,
    studyId,
  }}
  search={{
    tab: "participants",
  }}
>
  Abrir estudio
</Link>
```

Effect:

```ts
yield* Router.navigate("study", {
  params: {
    locale,
    studyId,
  },
  search: {
    tab: "participants",
  },
})
```

El registro tipado de destinos se infiere del árbol. Tanto React como Effect
usan el mismo contrato de navegación y la misma implementación.

Debe ser error de TypeScript:

- omitir un param local o heredado;
- añadir un param desconocido;
- usar un ID de ruta inexistente;
- proporcionar un search param no declarado;
- proporcionar un valor incompatible con su schema;
- declarar en `params` un nombre que no aparece en `path`;
- no declarar el schema de un parámetro dinámico del `path`.

La navegación externa que abandona la SPA, como OAuth, continuará usando
`DocumentNavigation`.

## Modelo Effect

El núcleo del router será React-neutral. Una transición conceptual:

```text
NavigationIntent
  → construir o leer URL
  → parsear
  → encontrar matches
  → decodificar params y search
  → comprobar blockers
  → confirmar en History
  → publicar estado
```

Las operaciones susceptibles de fallo o interrupción se expresarán como
`Effect`. Los errores serán uniones tipadas, al menos:

```ts
type RouterError =
  | RouteNotFound
  | InvalidRouteParams
  | InvalidSearchParams
  | UnknownDestination
  | NavigationBlocked
  | HistoryError
```

Debe definirse qué errores forman parte del estado renderizable y cuáles son
defectos de programación. Por ejemplo, un destino inexistente desde una llamada
tipada es un defecto; una URL externa con params inválidos es un estado
renderizable.

Las transiciones tendrán identidad monotónica o un mecanismo equivalente. Una
transición antigua no podrá sobrescribir el resultado de una más reciente. Los
Effects pendientes se interrumpirán cuando sean reemplazados.

## Modelo de atoms

### Estado fuente

El estado fuente durable contiene la ubicación canónica:

```ts
interface RouterLocationState {
  readonly location: Location
}
```

La transición en curso pertenece al plano runtime porque contiene lifecycle,
interrupción y coordinación que no pueden reanudarse desde un snapshot:

```ts
type RouterTransition =
  | { readonly _tag: "Idle" }
  | {
      readonly _tag: "Navigating"
      readonly transitionId: number
      readonly destination: NavigationDestination
    }
```

El atom fuente durable se marcará como serializable con key estable y Effect
Schema. En la versión fijada actualmente por el workspace, la forma es:

```ts
const routerLocationAtom = Atom.make(initialRouterLocation).pipe(
  Atom.serializable({
    key: "router/location",
    schema: RouterLocationSchema,
  }),
)
```

La API sigue siendo inestable en `effect@4.0.0-beta.98`; se fijará su
comportamiento mediante pruebas antes de depender de ella.

### Estado derivado

Se recalculará desde `routerLocationAtom`, el estado runtime y el árbol estático:

```text
routerTransitionAtom
currentMatchesAtom
currentRouteAtom
currentParamsAtom
currentSearchAtom
navigationStatusAtom
```

Los comandos serán function atoms o bindings del servicio Effect:

```text
navigateAtom
replaceAtom
backAtom
forwardAtom
```

No se serializan funciones, Effect values, transiciones activas ni atoms
derivados.

### Registry único

`apps/web` conservará un único `RegistryProvider`. El router usará ese registry;
no creará un store React paralelo.

La suscripción de React al estado del router debe apoyarse en Effect Atom y no en
una copia sincronizada mediante `useEffect`.

`Hydration.dehydrate(registry)` solo incluye atoms serializables que ya tienen
un node creado en el registry. El bootstrap y los tests harán explícito qué
atoms forman parte del snapshot.

`RegistryProvider` recibe actualmente `initialValues`, no un snapshot
deshidratado. Antes de implementar se prototipará cómo hidratar el registry
antes de la primera lectura. No se aceptará una hidratación posterior al primer
render que produzca un estado visible intermedio.

## Serialización e hidratación

### Definición de “todo el estado”

Todo estado durable de aplicación que deba participar en snapshots tendrá:

- key global estable;
- Effect Schema de codificación y decodificación;
- valor inicial explícito;
- política de inclusión;
- versión y, cuando sea necesario, migración.

No son serializables:

- fibers;
- listeners;
- `AbortController`;
- referencias DOM;
- funciones;
- Layers y servicios Effect;
- clientes HTTP;
- el objeto `window.history`;
- recursos externos abiertos.

Estos elementos pertenecen al runtime y se reconstruyen al hidratar.

### Contenido del snapshot

```ts
interface ApplicationSnapshot {
  readonly version: number
  readonly createdAt: string
  readonly atoms: ReadonlyArray<DehydratedAtom>
}
```

Los atoms derivados no se almacenan. Los atoms remotos solo se incluirán si
poseen un schema seguro y una política explícita. No se persistirán cookies,
tokens, causas arbitrarias ni información sensible por defecto.

### Autoridad de la ubicación

Habrá dos políticas diferentes:

```ts
hydrate(snapshot, {
  location: "browser",
})
```

- para el arranque normal;
- hidrata estado de producto;
- la URL visible del navegador es autoritativa;
- recalcula el match desde esa URL.

```ts
hydrate(snapshot, {
  location: "snapshot",
})
```

- para reproducción, debugging y tests;
- restaura el estado;
- ejecuta `history.replace` con la ubicación guardada;
- recalcula todos los atoms derivados.

Una navegación pendiente no entra en el snapshot. El nuevo runtime comienza en
`Idle`; no se intenta reanudar su fiber.

La pila nativa completa de atrás/adelante no puede restaurarse fielmente. Si se
necesita time travel se mantendrá un journal lógico separado, sin prometer que
reproduce la pila privada del navegador.

### Persistencia

Serialización no implica persistencia automática. Se separarán:

- `dehydrate` / `hydrate`: crear y restaurar snapshots;
- almacenamiento: adapter opcional mediante `KeyValueStore`;
- journal de debugging: posible fase posterior.

No se escribirá `localStorage` en cada actualización del registry sin una
política explícita de frecuencia, tamaño, consentimiento y errores.

## Módulos y seams

Se ha elegido un paquete neutral porque el árbol tipado, matching, runtime
Effect y adapter en memoria forman un módulo profundo independiente de la
aplicación. El paquete se llama `@proxus/effect-router` para no presentarlo como
un paquete oficial del proyecto Effect.

```text
packages/effect-router/src/
├── model.ts
├── schema.ts
├── match.ts
├── compile.ts
├── runtime.ts
├── atoms.ts
├── snapshot.ts
└── testing.ts

packages/effect-router/src/react/
├── provider.tsx
├── outlet.tsx
├── link.tsx
└── navigate.tsx

apps/web/src/routes/
├── routes.tsx
└── router.tsx

apps/web/src/platform/routing/
├── browser-history.web.ts
└── browser-scroll.web.ts
```

Esta estructura es orientativa y no obliga a crear un archivo por concepto.
Durante la implementación se priorizará la localidad; módulos pequeños que solo
reexporten o deleguen se consolidarán.

Existirán dos adapters reales en el seam de History:

- navegador;
- memoria para tests.

No se extraerán otros paquetes reutilizables hasta que exista un segundo
consumidor real. `@proxus/effect-router` queda justificado por su núcleo neutral,
su adapter de memoria, sus pruebas a través de la misma interfaz y la decisión
explícita de mantener los globals del navegador fuera de ese núcleo.

El router solo aporta su atom de ubicación al snapshot. No será propietario de
los atoms de autenticación, registro u otros módulos de producto. La composition
root coordinará `Hydration.dehydrate` y `Hydration.hydrate` sobre el registry
completo.

## Integración con autenticación

El router no cargará la sesión:

```tsx
function AuthenticatedLayout() {
  const session = useAtomValue(currentSessionQuery)

  return AsyncResult.match(session, {
    onInitial: () => <SessionLoading />,
    onFailure: error => <SessionFailure error={error} />,
    onSuccess: session =>
      session === null
        ? <Navigate to="login" replace />
        : (
            <RequiredSessionScope session={session}>
              <Outlet />
            </RequiredSessionScope>
          ),
  })
}
```

Antes de migrar esta parte se decidirá si `RequiredSessionScope` usa:

- un Context estructural que falle fuera del layout; o
- un `ScopedAtom` con la misma garantía por subtree.

No se usará un atom singleton global que pueda conservar una sesión refinada
después de abandonar la rama autenticada.

La pantalla de inicio dejará de volver a comprobar `currentSessionQuery`.
Recibirá o consultará una sesión requerida. Las acciones como logout continuarán
siendo function atoms conectados directamente desde el módulo que las presenta.

## Corrección y testing

### Pruebas de tipos

Se crearán pruebas de compilación para demostrar:

- extracción de nombres desde paths;
- correspondencia exacta entre path y schemas;
- inferencia de props de componentes;
- acumulación de params para navegación;
- search params tipados;
- IDs de destino válidos;
- layouts e index routes como unión imposible de construir mal;
- `<Link>` y `Router.navigate` con el mismo contrato.

Estas pruebas son un gate del prototipo. Si requieren assertions amplias,
`any`, generación opaca o una interfaz considerablemente más compleja, se
revisará el diseño antes de continuar.

### Pruebas puras

- parsing y normalización de paths;
- ranking y matching;
- encoding y decoding de params;
- encoding y decoding de search;
- trailing slash, Unicode y percent encoding;
- hash y base path;
- not found y entradas inválidas;
- construcción de hrefs;
- detección de IDs duplicados.

### Pruebas Effect con History en memoria

- push y replace;
- back y forward;
- pop externo;
- redirects;
- protección frente a loops de redirect;
- interrupción de transiciones;
- latest transition wins;
- blockers;
- errores del adapter;
- cleanup de subscriptions y scopes.

### Pruebas de AtomRegistry

- transiciones observables;
- ausencia de estado React duplicado;
- dehydrate/hydrate;
- atoms derivados recalculados;
- normalización de navegación pendiente a `Idle`;
- aislamiento entre registries;
- snapshots versionados e inválidos.

### Pruebas React

- selección de rutas y `<Outlet>`;
- links accesibles e interceptación de clicks;
- modifier keys, `target`, `download` y enlaces externos;
- redirects;
- not found;
- error de URL;
- layout autenticado;
- Strict Mode sin listeners duplicados;
- HMR sin listeners ni runtimes huérfanos;
- lazy route y error de importación.

### Pruebas del adapter web

- `pushState`, `replaceState` y `popstate`;
- scroll restoration;
- cleanup;
- base path;
- errores del host cuando puedan representarse.

## Estrategia incremental

### Fase 0: decisión normativa y criterios de éxito

1. Aprobar o modificar este plan.
2. Registrar la sustitución de TanStack Router en la documentación normativa.
3. Definir explícitamente qué significa “full type safety”.
4. Congelar una lista pequeña de URLs actuales como fixtures de compatibilidad.

**Gate:** no se implementa el router sin aprobar su interfaz y alcance.

### Fase 1: prototipo de tipos

1. Implementar solamente tipos y stubs sin navegador.
2. Probar el árbol al estilo React Router.
3. Probar componentes inline y nombrados.
4. Probar navegación por ID y acumulación de params.
5. Medir tiempos de TypeScript y calidad de errores.

**Gate:** la interfaz debe seguir siendo pequeña y los errores comprensibles.

**Resultado preliminar (2026-07-30):** la inferencia directa de objetos
recursivos dentro de `createRouter([...])` excedió la profundidad de TypeScript
y perdió tipos contextuales. El prototipo estable usa helpers mínimos:

```tsx
createRouter([
  route({
    path: ":locale",
    params: { locale: Locale },
    Component: LocaleRoute,
    children: [
      layout({
        Layout: AuthenticatedLayout,
        children: [
          index({
            id: "home",
            Component: HomeRoute,
          }),
          route({
            id: "study",
            path: "studies/:studyId",
            params: { studyId: StudyId },
            search: StudySearch,
            Component: StudyRoute,
          }),
        ],
      }),
    ],
  }),
], {
  NotFound: NotFoundPage,
  InvalidUrl: InvalidUrlPage,
  Error: RouterErrorPage,
})
```

Este contrato ya prueba extracción de params, props locales decodificadas,
search tipado y acumulación de params ancestrales en destinos. Antes de cerrar
la fase faltan medir el coste con un árbol representativo y decidir la forma de
componentes nombrados.

### Fase 2: núcleo puro

1. Modelos y schemas.
2. Compilación del árbol.
3. Matching y ranking.
4. Parseo y construcción de URLs.
5. Errores tipados.

**Gate:** tests puros exhaustivos, sin React ni browser globals.

### Fase 3: runtime Effect y atoms

1. Servicio `Router`.
2. Estado fuente serializable.
3. Atoms derivados.
4. Function atoms/bindings de navegación.
5. History en memoria.
6. Interrupción, ordering y blockers.
7. Snapshots e hidratación.

**Gate:** todos los journeys de navegación se prueban a través de la interfaz
del módulo con el adapter en memoria.

### Fase 4: integración React

1. `RouterProvider`.
2. `Outlet`.
3. `Link`.
4. `Navigate`.
5. Hooks focalizados.
6. Lazy routes.
7. Estados not found e invalid URL.

**Gate:** no existe store React paralelo ni sincronización duplicada.

### Fase 5: adapter del navegador

1. History.
2. `popstate`.
3. interceptación de navegación.
4. scroll restoration.
5. base path.
6. lifecycle y cleanup.

**Gate:** contract tests compartidos entre los adapters de memoria y navegador.

### Fase 6: migración de `apps/web`

1. Migrar primero rutas públicas sencillas.
2. Migrar locale.
3. Migrar search params del registro.
4. Migrar layouts public-only y authenticated.
5. Refinar la sesión requerida para eliminar comprobaciones duplicadas.
6. Sustituir `navigateAction` por el binding genérico del nuevo `Router`.
7. Migrar los accesos directos actuales a `globalThis.location` en navegación y
   registro al adapter y atoms del nuevo router.
8. Adaptar las pruebas arquitectónicas y de bootstrap que hoy exigen TanStack y
   `routes/files`.
9. Retirar los 12 route files actuales, el plugin Vite y el árbol generado.
10. Eliminar TanStack Router solamente cuando no queden imports ni rutas activas.

**Gate:** las URLs existentes y los flujos actuales mantienen compatibilidad.

### Fase 7: inspección y snapshots de aplicación

1. Inventariar los atoms durables actuales.
2. Clasificarlos como serializables, derivados, efímeros o runtime.
3. Añadir schemas y keys estables únicamente donde corresponda.
4. Definir formato versionado de snapshot.
5. Añadir export/import para desarrollo y tests.
6. Evaluar journal/time travel como trabajo posterior.

**Gate:** ninguna credencial o información sensible entra accidentalmente en un
snapshot.

## Migración y compatibilidad

La migración no mantendrá dos routers escribiendo History. Durante el desarrollo
se podrá ejecutar el nuevo router en tests y prototipos aislados, pero el cambio
de propietario en `apps/web` será atómico.

Antes de retirar TanStack se conservarán fixtures para, al menos:

```text
/:locale
/:locale/login
/:locale/password-recovery
/:locale/password-recovery/code
/:locale/password-recovery/new-password
/:locale/password-recovery/done
/:locale/app
```

También se preservará el comportamiento de search params del wizard de
registro, redirects de locale y navegación externa de OAuth.

## Capas afectadas

```text
- contrato compartido/API: no
- persistencia y repositories: no
- services/casos de uso backend: no
- handlers HTTP: no
- frontend core/atoms: sí, solo interfaces neutrales y snapshot policy si aplica
- adapters frontend web: sí
- UI, pantallas y rutas: sí
- tests y fixtures: sí
- documentación: sí
```

## Documentación normativa que deberá cambiar

La propuesta contradice deliberadamente la decisión actual de que TanStack
Router sea el único propietario de URL e History. Si se aprueba, habrá que
actualizar como mínimo:

- `docs/webapp-architecture.md`;
- `docs/effect/90_react_and_effect_atom.md`;
- `docs/architecture/atom-first-frontend.md`;
- `docs/architecture/client-platform-ports-and-adapters.md`;
- `docs/architecture/web-frontend.md`;
- `AGENTS.md`, si continúa nombrando TanStack como decisión obligatoria.

Se considerará registrar la decisión en un ADR para evitar que futuras
revisiones vuelvan a proponer TanStack sin conocer los motivos del cambio.

## Riesgos

### Recrear accidentalmente un router generalista

Mitigación: mantener explícitamente fuera loaders, SSR, data cache y servidor.
Cada capacidad nueva debe justificarse por un journey real de `apps/web`.

### TypeScript complejo o lento

Mitigación: prototipo de tipos como primera fase y gate independiente. Preferir
IDs y contratos explícitos antes que inferencia recursiva difícil de comprender.

### Snapshots que prometen más de lo posible

Mitigación: distinguir estado durable, estado derivado y runtime. No prometer
reanudar fibers ni restaurar la pila privada de History.

### Divergencia entre URL y registry

Mitigación: un solo atom fuente y una política explícita de autoridad durante la
hidratación. El adapter no mantendrá una segunda copia independiente.

### Seguridad y privacidad

Mitigación: inclusión opt-in, schemas seguros, revisión de cada atom y exclusión
por defecto de credenciales, cookies y causas arbitrarias.

### Regresiones de navegación del navegador

Mitigación: contract tests del adapter, fixtures de URLs existentes y migración
atómica.

### Acoplar producto al router

Mitigación: las routes entregan identidad estable; las páginas y módulos de
feature no reciben objetos internos del matcher ni `URLSearchParams`.

## Criterios de aceptación

La iniciativa se considera válida únicamente si:

1. la definición del árbol resulta comparable en simplicidad a React Router;
2. params, search, componentes, links y navegación son type-safe;
3. ningún componente recibe params/search sin decodificar;
4. History tiene adapters web y memoria con contract tests compartidos;
5. React observa el router mediante el `AtomRegistry` canónico;
6. el estado durable seleccionado puede deshidratarse e hidratarse con schemas;
7. los atoms derivados se reconstruyen correctamente;
8. los Effects pendientes se interrumpen o normalizan de forma determinista;
9. no existen loaders ni un segundo lifecycle de datos;
10. las URLs y journeys actuales permanecen compatibles;
11. TanStack Router y su generación se eliminan por completo al concluir la
    migración;
12. la interfaz del módulo es sensiblemente menor que su implementación y sus
    tests ejercen el mismo seam que los consumidores.

## Preguntas que deben cerrarse antes de implementar

1. ¿Los IDs de rutas serán obligatorios para todas las rutas o solo para destinos
   navegables?
2. ¿Preferimos `Layout: AuthenticatedLayout` o
   `{ layout: true, Component: AuthenticatedLayout }`?
3. ¿Los componentes nombrados justifican `defineRoute().component()` o basta con
   componentes inline y un tipo helper?
4. ¿Los search params desconocidos se preservan, se eliminan o producen error?
5. ¿Cuál será la política de trailing slash?
6. ¿Una URL con params inválidos muestra invalid URL, not found o redirige?
7. ¿Qué parte del estado remoto, si alguna, entra en snapshots de debugging?
8. ¿El snapshot será inicialmente solo una herramienta de tests/desarrollo o
   también persistencia de producto?
9. ¿La sesión requerida se refina mediante Context estructural o `ScopedAtom`?
10. ¿Lazy routes forman parte del primer release o del segundo?
11. ¿Debemos reconsiderar los IDs únicos si el prototipo modular demuestra una
    ventaja clara de navegar mediante referencias? La interfaz actual usa IDs y
    no expondrá ambas alternativas.

## Próximo paso

Revisar este documento y cerrar las preguntas anteriores. Después, implementar
exclusivamente la Fase 1 como prototipo desechable de tipos. No comenzar por
History, React ni migración de rutas hasta demostrar que la interfaz propuesta
ofrece la corrección y simplicidad buscadas.
