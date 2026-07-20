import { useAtomMount, useAtomSet, useAtomValue } from "@effect/atom-react"
import { toStudyCatalogViewState } from "@proxus/frontend-core/study-catalog"
import type { StudyNode } from "@proxus/shared/study-catalog"
import { Effect, Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { LanguageSelector, useMessagesCatalog } from "../../product-locale.js"
import { childrenFamily, rootsAtom } from "../study-catalog/atoms.js"
import {
  assignmentAtom,
  exposureLifecycleAtom,
  failedAtom,
  goBackRegistrationAtom,
  registrationPathAtom,
  resetRegistrationAtom,
  retryAtom,
  selectRegistrationNodeAtom,
} from "./atoms.js"
import { RegistrationWizardView } from "./registration-wizard-view.js"

const completedOptionsAtom = Atom.runtime(Layer.empty).atom(
  Effect.succeed<ReadonlyArray<StudyNode>>([]),
)

function RegistrationLandingExposure() {
  useAtomMount(exposureLifecycleAtom)
  return null
}

export function RegistrationWizard() {
  const path = useAtomValue(registrationPathAtom)
  const assignment = useAtomValue(assignmentAtom)
  const navigationFailed = useAtomValue(failedAtom)
  const selectNode = useAtomSet(selectRegistrationNodeAtom)
  const goBack = useAtomSet(goBackRegistrationAtom)
  const reset = useAtomSet(resetRegistrationAtom)
  const retryNavigation = useAtomSet(retryAtom)
  const messages = useMessagesCatalog()
  const parent = path.at(-1)
  const remoteOptions = useAtomValue(
    parent === undefined
      ? rootsAtom
      : parent.kind === "subject"
        ? completedOptionsAtom
        : childrenFamily(parent.id),
  )

  return (
    <>
      {path.length === 0 ? <RegistrationLandingExposure /> : null}
      <RegistrationWizardView
        path={path}
        options={toStudyCatalogViewState(remoteOptions)}
        landingAssignment={assignment}
        navigationFailed={navigationFailed}
        messages={messages}
        languageSelector={<LanguageSelector />}
        onSelect={selectNode}
        onBack={goBack}
        onReset={reset}
        onRetryNavigation={retryNavigation}
      />
    </>
  )
}
