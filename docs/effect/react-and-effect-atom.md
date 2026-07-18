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
      → feature API service → typed HTTP client
      → platform port ← web/native/test adapter
```

The frontend equivalent of the backend dependency rule is:

```text
view → atom → application client or platform port → adapter
```

Platform capabilities follow
[`../architecture/client-platform-ports-and-adapters.md`](../architecture/client-platform-ports-and-adapters.md).
Atoms depend on capability ports, never browser globals, React Native modules, or vendor SDKs.

## Runtime and Layers

Each frontend application has one registry at its root and a canonical Atom
runtime backed by a Layer:

```tsx
<RegistryProvider>
  <RouterProvider router={router} />
</RegistryProvider>
```

```ts
export const studyCatalogRuntime = Atom.runtime(
  StudyCatalogApiLive.pipe(
    Layer.provide(WebHttpClientLive),
  ),
)
```

Atoms yield services from the runtime. React modules must not call
`Effect.runPromise`, build Layers, read environment variables, or know the API
base URL. Reactive platform state is composed through atom factories at the
application boundary; Effect capabilities are provided as platform Layers.

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
arbitrary setters spread through components.

## Forms

Admin forms are schema-backed and family-scoped. Validation, submission,
loading, and server failures belong to atoms. React renders fields and accessible
messages and dispatches field or submit events.

Local React state is reserved for genuinely view-local behavior that has no
application meaning, persistence, asynchronous work, or cross-component use.

## Realtime público

Cada aplicación monta un único atom de lifecycle realtime en su registry raíz. El port neutral vive en `frontend-core` y el adapter fetch/SSE con credenciales en `frontend-web`. El supervisor hace conexión inicial, reconnect con backoff exponencial acotado y cleanup por interrupción/logout/unmount. Cada conexión o reconexión invalida el snapshot; los hints se deduplican por `eventId`/revisión y nunca se aplican como estado. `GET /feature-flags/snapshot` es siempre la autoridad y su TTL/refetch mantiene el producto operativo cuando SSE no está disponible.

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
