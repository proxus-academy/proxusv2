import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { StudyNode } from "@proxus/shared/study-catalog"
import { Effect, Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { useProductLocale } from "../../i18n.js"
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
  const locale = useProductLocale()
  const path = useAtomValue(registrationPathAtom)
  const selectNode = useAtomSet(selectRegistrationNodeAtom)
  const goBack = useAtomSet(goBackRegistrationAtom)
  const reset = useAtomSet(resetRegistrationAtom)
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
      locale={locale}
      path={path}
      options={options}
      onSelect={selectNode}
      onBack={goBack}
      onReset={reset}
    />
  )
}
