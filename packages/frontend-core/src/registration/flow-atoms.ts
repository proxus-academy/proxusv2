import { Effect, type Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"
import {
  clearRegistrationDraft,
  loadRegistrationDraft,
  saveRegistrationDraft,
} from "./draft-storage.js"
import { restoredRegistrationState, transitionRegistration, type RegistrationEvent, type RegistrationState, type RegistrationStep } from "./wizard.js"

export interface RegistrationFlowCapabilities<E> {
  readonly storageLayer: Layer.Layer<KeyValueStore.KeyValueStore>
  readonly now: () => number
  readonly navigate: (step: RegistrationStep, state: RegistrationState, get: Atom.FnContext) => Effect.Effect<void, E>
}

/** Single observable owner of registration state and persisted draft. */
export const makeRegistrationFlowAtoms = <E>(capabilities: RegistrationFlowCapabilities<E>) => {
  const runtime = Atom.runtime(capabilities.storageLayer)
  const stateAtom = Atom.make<RegistrationState>({ _tag: "ChoosingMethod" })
  const restoreLifecycleAtom = runtime.atom(Effect.gen(function*() {
    const restored = yield* loadRegistrationDraft(capabilities.now())
    if (restored !== undefined) {
      const registry = yield* AtomRegistry.AtomRegistry
      registry.set(stateAtom, restoredRegistrationState(restored))
    }
  })).pipe(Atom.setIdleTTL(0))
  const dispatchAtom = runtime.fn<RegistrationEvent>()((event, get) => Effect.gen(function*() {
    const next = transitionRegistration(get(stateAtom), event)
    get.set(stateAtom, next)
    if (next._tag === "CollectingOnboarding" || next._tag === "ConfirmingGoogle") {
      yield* Effect.ignore(saveRegistrationDraft(next.draft, capabilities.now()))
    }
    if (next._tag === "Completed" || next._tag === "ChoosingMethod") {
      yield* Effect.ignore(clearRegistrationDraft)
    }
    const step = next._tag === "CollectingOnboarding"
      ? next.step
      : next._tag === "ConfirmingGoogle"
      ? "confirm-google"
      : next._tag === "EmailVerificationPending"
      ? "verify"
      : next._tag === "ChoosingMethod"
      ? "start"
      : undefined
    if (step !== undefined) yield* capabilities.navigate(step, next, get)
  }))
  return { stateAtom, restoreLifecycleAtom, dispatchAtom }
}

export type RegistrationFlowAtoms = ReturnType<typeof makeRegistrationFlowAtoms>
