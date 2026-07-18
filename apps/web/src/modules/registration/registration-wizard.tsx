import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { StudyNode } from "@proxus/shared/study-catalog"
import { recordRegistrationAnalytics, resolveRegistrationLanding, type RegistrationLandingAssignment } from "@proxus/frontend-web/feature-flags"
import { Effect, Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { useEffect, useState } from "react"
import { childrenFamily, rootsAtom } from "../study-catalog/atoms.js"
import {
  goBackRegistrationAtom,
  registrationPathAtom,
  resetRegistrationAtom,
  selectRegistrationNodeAtom,
} from "./atoms.js"
import { RegistrationWizardView } from "./registration-wizard-view.js"

const completedOptionsAtom = Atom.runtime(Layer.empty).atom(
  Effect.succeed<ReadonlyArray<StudyNode>>([]),
)

export function RegistrationWizard() {
  const path = useAtomValue(registrationPathAtom)
  const selectNode = useAtomSet(selectRegistrationNodeAtom)
  const goBack = useAtomSet(goBackRegistrationAtom)
  const reset = useAtomSet(resetRegistrationAtom)
  const [assignment, setAssignment] = useState<RegistrationLandingAssignment | null>(null)
  useEffect(() => {
    let active = true
    void resolveRegistrationLanding().then((value) => {
      if (!active) return
      setAssignment(value)
      void recordRegistrationAnalytics(value, "feature_flag_exposed")
    })
    return () => { active = false }
  }, [])
  const onSelect = (node: StudyNode) => {
    if (assignment !== null && path.length === 0) void recordRegistrationAnalytics(assignment, "registration_started")
    if (assignment !== null && node.kind === "subject") void recordRegistrationAnalytics(assignment, "registration_completed")
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
      landingVariant={assignment?.variant ?? "short"}
      onSelect={onSelect}
      onBack={goBack}
      onReset={reset}
    />
  )
}
