# Web frontend ownership

## Boundaries

- `frontend-core` owns React-neutral schemas, transitions, form builders and atom factories.
- `frontend-web` owns browser adapters (History, storage, HTTP, locale and OAuth navigation).
- `apps/web` owns the composition root and React screens/views.
- Presentational views do not import the composition root. Screens are the only React modules that connect feature atoms to views.

## Screens and atoms

| Screen | Atoms |
| --- | --- |
| `PublicRouterPage` | router location, session restoration/session |
| `AuthScreen` | recovery state/dispatch, auth mutations, typed auth/registration navigation |
| `RegistrationScreen` | registration flow state/dispatch, catalog query, OAuth/email mutations, registration URL |
| `AuthenticatedScreen` | session and logout |

`App.tsx` only mounts the route boundary. Infrastructure subscriptions formerly grouped in `ProductLifecycle` are mounted by the registration screen that consumes them.

## Forms

Product schemas and cross-field refinements live in `frontend-core` and import the React-neutral `@proxus/effect-form` entrypoint. React field adapters live beside their feature and import `@proxus/effect-form/react`; their markup uses accessible `@proxus/ui` field primitives (`label`, `aria-invalid`, `aria-describedby`, and error controls).

A form submit is represented by the form's observable `AsyncResult`. `Initialize` establishes identity/default values and `KeepAlive` preserves fields required across temporary unmounts. Registration draft persistence has one observable flow owner; the browser storage adapter validates schema/version/TTL and stale restores cannot overwrite a newer in-memory flow.

## Registration ownership

`registrationFlow.stateAtom` is the authoritative registration machine. Its dispatch atom applies transitions, persists/clears the schema-backed draft, and uses typed `RegistrationStep` navigation. React does not duplicate this machine with `useState`, and the URL is a projection/navigation concern rather than a second product-state owner.
