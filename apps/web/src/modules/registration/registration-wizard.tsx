import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { StudyNode } from "@proxus/shared/study-catalog"
import { Effect, Layer } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import { childrenFamily, rootsAtom } from "../study-catalog/atoms.js"
import {
  assignmentAtom,
  goBackRegistrationAtom,
  registrationCompletedAtom,
  registrationPathAtom,
  registrationStartedAtom,
  resetRegistrationAtom,
  selectRegistrationNodeAtom,
} from "./atoms.js"
import { RegistrationWizardView } from "./registration-wizard-view.js"

const completedOptionsAtom = Atom.runtime(Layer.empty).atom(
  Effect.succeed<ReadonlyArray<StudyNode>>([]),
)

export function RegistrationWizard() {
  const path = useAtomValue(registrationPathAtom)
  const assignment = useAtomValue(assignmentAtom)
  const selectNode = useAtomSet(selectRegistrationNodeAtom)
  const registrationStarted = useAtomSet(registrationStartedAtom)
  const registrationCompleted = useAtomSet(registrationCompletedAtom)
  const goBack = useAtomSet(goBackRegistrationAtom)
  const reset = useAtomSet(resetRegistrationAtom)
  const onSelect = (node: StudyNode) => {
    if (AsyncResult.isSuccess(assignment)) {
      if (path.length === 0) registrationStarted(assignment.value)
      if (node.kind === "subject") registrationCompleted(assignment.value)
    }
    selectNode(node)
  }
  const parent = path.at(-1)
  const options = useAtomValue(
    parent === undefined
      ? rootsAtom
      : parent.kind === "subject"
        ? completedOptionsAtom
        : childrenFamily(parent.id),
  )

  return (
    <RegistrationWizardView
      path={path}
      options={options}
      landingAssignment={assignment}
      onSelect={onSelect}
      onBack={goBack}
      onReset={reset}
    />
  )
}
