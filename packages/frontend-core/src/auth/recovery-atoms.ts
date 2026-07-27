import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { initialRecoveryState, transitionRecovery, type RecoveryEvent } from "./recovery.js"

/** Stable observable owner for the public password-recovery state machine. */
export const recoveryStateAtom = Atom.make(initialRecoveryState)

export const dispatchRecoveryAction = Atom.fn<RecoveryEvent>()((event, get) => Effect.sync(() => {
  get.set(recoveryStateAtom, transitionRecovery(get(recoveryStateAtom), event))
}))

/** @deprecated Existing clients may migrate independently to the stable exports above. */
export const makeRecoveryAtoms = () => {
  const stateAtom = Atom.make(initialRecoveryState)
  const dispatchAtom = Atom.fn<RecoveryEvent>()((event, get) => Effect.sync(() => {
    get.set(stateAtom, transitionRecovery(get(stateAtom), event))
  }))
  return { stateAtom, dispatchAtom }
}

export type RecoveryAtoms = ReturnType<typeof makeRecoveryAtoms>
