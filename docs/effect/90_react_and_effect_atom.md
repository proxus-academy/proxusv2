# React and Effect Atom

## Status

Required frontend architecture for `apps/web`, `apps/mobile-web`, the future `apps/admin`, and future React Native clients.

React owns rendering. Effect Atom owns application state, remote state, mutations,
resource lifecycles, forms, and Effect runtime integration. Components must not
call transport clients or execute Effects directly.

For React-specific rules about derived state, event handlers, synchronization,
and legitimate `useEffect` usage, see
[`../webapp-architecture.md`](../webapp-architecture.md). In that document,
React “Effects” means `useEffect`, not the Effect library.

## Required flow

```text
React route/component
  → atom hook
    → feature atom
      → typed HTTP client → Effect HttpClient Layer
      → platform port ← web/native/test adapter
```

The frontend equivalent of the backend dependency rule is:

```text
view → atom → typed HTTP client or platform port → Effect/platform adapter
```

Platform capabilities follow
[`../architecture/client-platform-ports-and-adapters.md`](../architecture/client-platform-ports-and-adapters.md).
Atoms use the shared typed HTTP API directly when the operation is already expressed by an endpoint. Do not create feature client services that merely duplicate generated endpoint methods. Capability ports remain appropriate for non-Effect or platform-specific behavior such as routing, storage, browser redirects, React Native modules, and vendor SDKs; atoms never access those implementations or browser globals directly.

## Runtime and Layers

Each frontend application has one registry at its root and a canonical Atom
runtime backed by a Layer:

```tsx
<RegistryProvider>
  <RouterProvider router={router} />
</RegistryProvider>
```

```ts
export const applicationRuntime = Atom.runtime(UnconfiguredHttpClientLayer)

// At the application boundary:
Atom.initialValue(applicationRuntime.layer, WebHttpClientLive)
```

Remote atoms build the typed `HttpApiClient` as an Effect and use the `HttpClient` supplied by the runtime. React modules must not call `Effect.runPromise`, build Layers, read environment variables, or know transport configuration. Reactive platform state is composed at the application boundary; Effect and platform capabilities are provided as Layers.

## Module layout

```text
apps/<client>/src/modules/study-catalog/
├── api.ts
├── runtime.ts
├── keys.ts
├── public/
│   ├── queries.ts
│   ├── selectors.ts
│   └── screens.tsx
└── admin/
    ├── queries.ts
    ├── mutations.ts
    ├── forms.ts
    └── screens.tsx
```

Do not put all feature behavior in one atom file. Keep query, mutation, derived,
and form atoms separate while preserving one feature-local public interface.

## Remote state

Use runtime-backed atoms for Effects and preserve `AsyncResult` at screen seams.
Loading, failure, empty, refreshing, and success are distinct states. Never map
all non-success states to an empty collection.

Use `Atom.family` for state keyed by branded node IDs, edge IDs, routes, or form
instances. Compound family keys must include every identity and mode required to
prevent state leakage between editors.

## Mutations

Mutations use runtime function atoms. Components dispatch typed arguments; they
do not contain Effect programs or anonymous transport calls. Successful
mutations invalidate or refresh the narrow affected query families.

Product transitions should be exposed through named mutation atoms rather than
arbitrary setters spread through components. Routing itself is an Effect
service: workflows obtain it from the Layer and call its fully typed `navigate`
or `replace` methods directly. Do not model each destination as a separate
action atom. React may use one generic binding to that service for plain links
or buttons.

Navigation workflows that promise explicit retry additionally run the Effect
through the single `makeRetryableCommands` module composed from
`@proxus/frontend-core/navigation`: adapters receive its runner, while views
read `failedAtom` and dispatch `retryAtom`. Views must not inspect several
`AsyncResult` values or compare causes to decide which command to retry.

## Forms

Admin forms are schema-backed and family-scoped. Validation, submission,
loading, and server failures belong to atoms. React renders fields and accessible
messages and dispatches field or submit events.

Local React state is reserved for genuinely view-local behavior that has no
application meaning, persistence, asynchronous work, or cross-component use.

## Distribución pública de Feature Flags

Cada aplicación compone el port neutral `FeatureFlagDistribution` con su adapter
de plataforma y crea un único módulo mediante `makeFeatureFlagSnapshotModule`.
El módulo devuelve `snapshotAtom` y `lifecycleAtom`: `App` monta únicamente el
lifecycle, que hace la lectura inicial y revalida mediante el `Clock` de Effect y
el `AtomRegistry` activo. El intervalo es configurable y por defecto son cinco
minutos, coherentes con `Cache-Control: max-age=300`; al desmontarse se cierra su
scope y se cancela el polling. `frontend-core` no usa timers ni globals del
browser.

El snapshot y el assignment conservan `AsyncResult`; durante una revalidación,
Effect Atom mantiene el último `Success` con `waiting: true`. Si la revalidación
falla, el estado pasa a `Failure` y conserva ese valor en `previousSuccess`. Las
decisiones derivadas no copian el snapshot a React ni abren un segundo
transporte. Los hitos analíticos causados por una interacción reciben `void` y
usan el último assignment efectivamente expuesto por el lifecycle de landing:
una revalidación mientras el path ya no está vacío no cambia esas coordenadas y,
si nunca hubo exposición, el hito no se emite. De este modo un callback React no
transporta una revisión obsoleta ni atribuye un hito a una variante no vista. En
web, el cliente tipado usa
`GET /api/feature-flags/snapshot` y analytics usa
`POST /api/product-analytics/events`; Vite retira `/api` en desarrollo sin
cambiar origin ni host. La caché HTTP del navegador revalida con
`ETag`/`If-None-Match` según `Cache-Control`.

La exposición se monta, separada del lifecycle del snapshot, en la superficie de
landing únicamente mientras el path está vacío, conserva inmediatamente el
último assignment visible durante el resto del registro y se deduplica por
revisión y subject incluso ante el remount de Strict Mode; no pertenece a `App`.
Las entregas analytics se ejecutan concurrentemente dentro del scope del
lifecycle, de modo que una petición bloqueada no serializa revisiones visibles
posteriores. No se monta un supervisor push ni SSE: PostgreSQL, el polling pull-based y el
conditional GET son la distribución válida entre publisher, servidores y
clientes públicos.

## Testing

Test atoms through `AtomRegistry`:

- replace runtime Layers with test Layers;
- mock the feature API service, not `fetch`;
- replace platform ports with memory atoms or test Layers instead of mocking browser/native globals or SDKs;
- mount the production atom;
- assert `AsyncResult` transitions;
- verify family isolation;
- verify invalidation after mutations;
- verify interruption and cleanup.

Component tests verify accessible rendering and interaction. They do not become
the only place application behavior is tested.

## Reference assessment

Useful patterns from `.repos/effect-ai-chat-example`:

- one `RegistryProvider` at the React root;
- `Atom.runtime(Layer)` for service-backed atoms;
- an application-owned API service in front of transport;
- `Atom.family` for entity isolation;
- `AtomRegistry` with injected Layers in tests;
- schema-backed persistent preferences.

Do not copy:

- RPC/WebSocket as the default catalog transport;
- handlers that call repositories directly;
- hard-coded runtime URLs;
- one monolithic atom file;
- unchecked constructors for route input;
- wildcard Effect dependency versions.

Relevant reference material:

- `.repos/effect-ai-chat-example/knowledge/skills/effect-atom-v4.md`
- `.repos/effect-ai-chat-example/knowledge/skills/effect-atom-testing-v4.md`
- `.repos/effect-ai-chat-example/knowledge/skills/effect-layers-v4.md`
- `.repos/effect-ai-chat-example/knowledge/rules/effect-atom.md`
- https://foldkit.dev/react/foldkit-vs-react-effect-atom/
