# Web application architecture

## Status

Required React architecture for `apps/web`, `apps/mobile-web`, the future
`apps/admin`, and future React Native clients.

This document defines React rendering and synchronization rules. Application
state, remote state, mutations, forms, and Effect runtime integration follow
[`effect/react-and-effect-atom.md`](effect/react-and-effect-atom.md). Browser and
device capabilities additionally follow
[`architecture/client-platform-ports-and-adapters.md`](architecture/client-platform-ports-and-adapters.md).

In this document, **Effect** in React quotations means React's `useEffect` hook,
not the Effect library or Effect Atom.

## Core rule

React components render from props and state. `useEffect` is an escape hatch for
synchronizing a mounted component with a system outside React. If no external
system is involved, do not use `useEffect`.

Before adding an effect, identify why the code must run:

- because React is rendering: calculate it during render;
- because the user performed an action: run it from that event handler;
- because application or remote state changed: model it with Effect Atom;
- because a component must connect to an external system while mounted: use
  `useEffect` or a more specific React API.

## Decision table

| Need | Required mechanism |
| --- | --- |
| Derive a value from props or state | Pure calculation during render |
| Avoid repeating a measured expensive calculation | React Compiler or `useMemo` |
| Handle a click, submit, drag, or other user action | Event handler |
| Execute a remote mutation caused by an interaction | Event handler dispatching a named mutation atom |
| Read remote data and represent loading, failure, refresh, or success | Query atoms and `AsyncResult` |
| Reset a whole subtree when entity identity changes | A stable identity-based `key` |
| Share state between components | Lift state or use a feature atom when it has application meaning |
| Subscribe to an external store | `useSyncExternalStore` where applicable |
| Connect a view-owned imperative host API | Focused platform component/hook; `useEffect` with symmetric cleanup when needed |
| Use an application-level browser/device capability | Feature atom consuming a platform port |

`useMemo` is a performance optimization, not a correctness mechanism. Measure
before adding manual memoization; React Compiler may make it unnecessary.

## Derived state

Do not copy values that can be calculated from props, local state, or atom state
into another state variable through `useEffect`.

```tsx
// Avoid: redundant state, stale render, and a second render.
const [fullName, setFullName] = useState("")
useEffect(() => setFullName(`${firstName} ${lastName}`), [firstName, lastName])

// Required: derive during render.
const fullName = `${firstName} ${lastName}`
```

Store the smallest complete state. Prefer stable identifiers over duplicated
objects, then derive the selected object during render.

Do not copy atom values into component state merely to keep them synchronized.
Render the atom value directly or derive another atom when the derivation has
application meaning or is shared.

## Events and mutations

Logic caused by a user interaction belongs to that interaction's handler. Do
not set a flag in an event handler so that an effect can later perform the real
action.

```tsx
// Avoid: the mutation is indirectly triggered after rendering.
const [pending, setPending] = useState<Payload | null>(null)
useEffect(() => {
  if (pending) submit(pending)
}, [pending])

// Required: dispatch at the point that explains why it happens.
const submit = useAtomSet(submitStudyMutation)
const onSubmit = (payload: Payload) => submit(payload)
```

Shared event logic should be extracted into a function called by the relevant
handlers. Product transitions must remain named atom operations, not arbitrary
component setters or transport calls.

Avoid chains of effects that update state only to trigger one another. Compute
derived values during render and calculate the complete transition in the event
handler or application atom.

## Resetting and sharing state

When a route or entity identity changes and an entire editor must reset, render
the editor with an identity-based `key`. Do not clear each local field in an
effect.

For partial selection state, prefer storing an ID and deriving the selected
entity. If a parent and child need the same value, lift ownership to the parent
or to a feature atom. Children must not push fetched data into parent state from
an effect.

Local React state is appropriate only for genuinely view-local state without
application meaning, persistence, asynchronous work, or cross-component use.

## Remote data and forms

Components must not fetch data directly in `useEffect`. Proxus uses Effect Atom
for requests, cancellation, caching policy, loading and failure states,
invalidation, and retries. Follow the required flow:

```text
view → atom → application client → transport
```

A form submission is a user event. The submit handler dispatches a schema-backed
mutation atom; an effect must not infer submission from changed form state.
Navigation and URL state use router APIs rather than duplicated synchronization
state.

## Legitimate effects

Use `useEffect` when a mounted component owns synchronization with an external
system for which no more specific integration exists. Persistence, permissions,
connectivity, notifications, file selection and application-level deep links use
platform ports rather than component effects. Legitimate view-owned examples include:

- connecting and disconnecting an imperative widget;
- registering and removing browser event listeners;
- controlling a media or DOM API that React does not model declaratively;
- telemetry whose cause is genuinely that a screen became visible.

Every effect must:

1. describe one synchronization process;
2. declare all reactive dependencies;
3. provide cleanup that reverses setup when applicable;
4. tolerate setup, cleanup, and setup again under React Strict Mode;
5. avoid application invariants, business transitions, and direct transport.

Prefer `useSyncExternalStore` for external stores. Prefer a focused custom hook
when synchronization is reused, so components consume a declarative API rather
than repeating raw effects.

## Review checklist

Before approving a `useEffect`, verify:

- an external system actually exists;
- the work is not a pure render calculation;
- the work is not caused by a specific user event;
- Effect Atom or the router does not already own the lifecycle;
- setup and cleanup are symmetric and Strict Mode safe;
- no remote or atom state is copied into redundant React state.

Tests should cover identity resets, external subscription cleanup, and duplicate
mount behavior. Atom tests cover remote transitions and mutation behavior; UI
tests cover accessible rendering and interaction.

## Sources

Project rules above are normative. The primary upstream rationale and examples
come from:

- React, [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- React, [Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects)
- React, [Lifecycle of Reactive Effects](https://react.dev/learn/lifecycle-of-reactive-effects)
- Local Effect Atom rules: [`effect/react-and-effect-atom.md`](effect/react-and-effect-atom.md)

Upstream React material last reviewed on 2026-07-15.
