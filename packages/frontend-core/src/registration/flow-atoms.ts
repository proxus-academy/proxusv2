import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { RegistrationDraftStorage } from "./draft-storage.js"
import { restoredRegistrationState, transitionRegistration, type RegistrationEvent, type RegistrationState, type RegistrationStep } from "./wizard.js"

export interface RegistrationFlowCapabilities<E> {
  readonly storage: RegistrationDraftStorage
  readonly now: () => number
  readonly navigate: (step: RegistrationStep, state: RegistrationState, get: Atom.FnContext) => Effect.Effect<void, E>
}

/** Single observable owner of registration state and persisted draft. */
export const makeRegistrationFlowAtoms = <E>(capabilities: RegistrationFlowCapabilities<E>) => {
  const restored = capabilities.storage.load(capabilities.now())
  const stateAtom = Atom.make<RegistrationState>(restored === undefined ? { _tag: "ChoosingMethod" } : restoredRegistrationState(restored))
  const dispatchAtom = Atom.fn<RegistrationEvent>()((event, get) => {
    const next = transitionRegistration(get(stateAtom), event)
    get.set(stateAtom, next)
    if (next._tag === "CollectingOnboarding" || next._tag === "ConfirmingGoogle") capabilities.storage.save(next.draft, capabilities.now())
    if (next._tag === "Completed" || next._tag === "ChoosingMethod") capabilities.storage.clear()
    const step = next._tag === "CollectingOnboarding" ? next.step : next._tag === "ConfirmingGoogle" ? "confirm-google" : "start"
    return capabilities.navigate(step, next, get)
  })
  return { stateAtom, dispatchAtom }
}

export type RegistrationFlowAtoms = ReturnType<typeof makeRegistrationFlowAtoms>
