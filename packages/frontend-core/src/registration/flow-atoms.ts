import { Effect, type Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"
import {
  clearRegistrationDraft,
  loadRegistrationDraft,
  saveRegistrationDraft,
} from "./draft-storage.js"
import { restoredRegistrationState, transitionRegistration, type RegistrationEvent, type RegistrationState } from "./wizard.js"

export interface RegistrationFlowCapabilities {
  readonly storageLayer: Layer.Layer<KeyValueStore.KeyValueStore>
  readonly now: () => number
}

/** Single observable owner of registration state and persisted draft. */
export const makeRegistrationFlowAtoms = (capabilities: RegistrationFlowCapabilities) => {
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
  }))
  return { stateAtom, restoreLifecycleAtom, dispatchAtom }
}

export type RegistrationFlowAtoms = ReturnType<typeof makeRegistrationFlowAtoms>
