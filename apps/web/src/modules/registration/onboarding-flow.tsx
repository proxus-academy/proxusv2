import { registration_chooseMethod_connectingGoogle, registration_completed_active, registration_completed_title } from "../../paraglide/messages.js"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { RegistrationState, RegistrationStep } from "@proxus/frontend-core/registration"
import type { RegistrationUrlState } from "../../platform/registration/wizard-url.js"
import { Box, Heading, Text } from "@proxus/ui"
import { registrationStateAtom } from "./state.js"
import { AccountStep } from "./steps/account-step.js"
import { ChoosingMethod } from "./steps/choosing-method.js"
import { ProblemStep } from "./steps/problem-step.js"
import { ProblemOtherStep } from "./steps/problem-step.js"
import { ProfileStep } from "./steps/profile-step.js"
import { StudyStepPage } from "./steps/study-step.js"
import { DiscoveryStep } from "./steps/discovery-step.js"
import { ConfirmGoogle, EmailVerification } from "./steps/verification-steps.js"
import { RegistrationFailure } from "./registration-summary.js"
import { RegistrationPageShell } from "./registration-shell.js"
import { changeRegistrationStudyPathAction, dispatchRegistrationAction, editRegistrationStepAction } from "./state.js"
import {
  registrationStepCompletedAnalyticsAction,
  registrationStepViewedAnalyticsAction,
} from "./feature-flags.js"
import { useEffect, useMemo, useRef } from "react"

const onboardingSteps = new Set<RegistrationStep>([
  "problem",
  "problem-other",
  "study",
  "profile",
  "discovery",
  "account",
  "verify",
  "confirm-google",
])

function OnboardingSteps({ state, requestedStep, onComplete }: {
  readonly state: Extract<RegistrationState, { readonly _tag: "CollectingOnboarding" | "ConfirmingGoogle" }>
  readonly requestedStep?: RegistrationStep
  readonly onComplete: () => Promise<void>
}) {
  const edit = useAtomSet(editRegistrationStepAction)
  const dispatch = useAtomSet(dispatchRegistrationAction)
  const changeStudyPath = useAtomSet(changeRegistrationStudyPathAction)
  const draft = state.draft
  const step = state._tag === "ConfirmingGoogle" ? "confirm-google" : (requestedStep ?? state.step)
  const sequence: ReadonlyArray<RegistrationStep> = [
    "problem", "study", "profile", "discovery",
    draft.provider === "google" ? "confirm-google" : "account",
  ]
  const index = sequence.indexOf(step === "problem-other" ? "problem" : step)
  const previous = sequence[index - 1]
  const content = step === "problem"
    ? <ProblemStep />
    : step === "problem-other"
    ? <ProblemOtherStep draft={draft} />
    : step === "study"
    ? <StudyStepPage draft={draft} />
    : step === "profile"
    ? <ProfileStep draft={draft} />
    : step === "discovery"
    ? <DiscoveryStep draft={draft} />
    : step === "account"
    ? <AccountStep draft={draft} />
    : state._tag === "ConfirmingGoogle"
    ? <ConfirmGoogle state={state} onComplete={onComplete} />
    : null
  return (
    <RegistrationPageShell
      wide={step === "study"}
      step={index + 1}
      totalSteps={draft.provider === "email" ? sequence.length + 1 : sequence.length}
      provider={draft.provider}
      {...(step === "problem"
        ? { onBack: () => dispatch({ _tag: "Cancelled" }) }
        : step === "problem-other"
        ? { onBack: () => edit("problem") }
        : step === "profile"
        ? { onBack: () => changeStudyPath(draft.path.slice(0, -1)) }
        : step === "study" && draft.path.length > 0
        ? { onBack: () => changeStudyPath(draft.path.slice(0, -1)) }
        : previous === undefined ? {} : { onBack: () => edit(previous) })}
    >
      {content}
    </RegistrationPageShell>
  )
}

/** Connected registration feature. It consumes stable atoms directly instead of an action bag. */
export function RegistrationOnboarding({ url = { step: "start", nodeIds: [], valid: true }, onOpenLogin, onComplete = () => Promise.resolve() }: {
  readonly url?: RegistrationUrlState
  readonly onOpenLogin?: () => void
  readonly onComplete?: () => Promise<void>
}) {
  const state = useAtomValue(registrationStateAtom)
  const requestedStep = onboardingSteps.has(url.step) ? url.step : undefined
  const recordViewed = useAtomSet(registrationStepViewedAnalyticsAction)
  const recordCompleted = useAtomSet(registrationStepCompletedAnalyticsAction)
  const currentStep = useMemo(() => {
    if (state._tag === "CollectingOnboarding" || state._tag === "ConfirmingGoogle") {
      const provider = state.draft.provider
      const sequence: ReadonlyArray<RegistrationStep> = [
        "problem", "study", "profile", "discovery",
        provider === "google" ? "confirm-google" : "account",
      ]
      const step = state._tag === "ConfirmingGoogle" ? "confirm-google" : (requestedStep ?? state.step)
      const index = sequence.indexOf(step === "problem-other" ? "problem" : step)
      return index < 0 ? undefined : { step, stepIndex: index + 1, totalSteps: provider === "email" ? 6 : sequence.length, provider }
    }
    if (state._tag === "EmailVerificationPending") {
      return { step: "verify", stepIndex: 6, totalSteps: 6, provider: "email" as const }
    }
    return undefined
  }, [requestedStep, state])
  const previousStep = useRef(currentStep)
  useEffect(() => {
    const previous = previousStep.current
    if (currentStep === undefined) {
      previousStep.current = undefined
      return
    }
    if (
      previous !== undefined
      && previous.provider === currentStep.provider
      && currentStep.stepIndex > previous.stepIndex
    ) recordCompleted(previous)
    if (
      previous === undefined
      || previous.step !== currentStep.step
      || previous.provider !== currentStep.provider
    ) recordViewed(currentStep)
    previousStep.current = currentStep
  }, [currentStep, recordCompleted, recordViewed])

  switch (state._tag) {
    case "ChoosingMethod": return <RegistrationPageShell><ChoosingMethod onOpenLogin={onOpenLogin ?? (() => undefined)} /></RegistrationPageShell>
    case "ResolvingGoogle": return <RegistrationPageShell><Box as="main" busy>
      <Heading level={1}>{registration_chooseMethod_connectingGoogle()}</Heading>
      <RegistrationFailure />
    </Box></RegistrationPageShell>
    case "EmailVerificationPending": return <RegistrationPageShell step={6} totalSteps={6} provider="email"><EmailVerification state={state} onComplete={onComplete} /></RegistrationPageShell>
    case "Completed": return <RegistrationPageShell><Box as="main"><Heading level={1}>{registration_completed_title()}</Heading><Text>{registration_completed_active()}</Text></Box></RegistrationPageShell>
    case "CollectingOnboarding":
    case "ConfirmingGoogle":
      return <OnboardingSteps state={state} onComplete={onComplete} {...(requestedStep === undefined ? {} : { requestedStep })} />
  }
}
