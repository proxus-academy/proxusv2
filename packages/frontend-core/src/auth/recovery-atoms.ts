import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { initialRecoveryState, transitionRecovery, type RecoveryEvent } from "./recovery.js"

/** Observable owner for the password-recovery state machine. */
export const makeRecoveryAtoms = () => {
  const stateAtom = Atom.make(initialRecoveryState)
  const dispatchAtom = Atom.fn<RecoveryEvent>()((event, get) => Effect.sync(() => {
    get.set(stateAtom, transitionRecovery(get(stateAtom), event))
  }))
  return { stateAtom, dispatchAtom }
}

export type RecoveryAtoms = ReturnType<typeof makeRecoveryAtoms>
