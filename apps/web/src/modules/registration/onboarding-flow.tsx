import { useAtomValue } from "@effect/atom-react"
import type { RegistrationState, RegistrationStep } from "@proxus/frontend-core/registration"
import type { RegistrationUrlState } from "../../platform/registration/wizard-url.js"
import { Heading, Text } from "@proxus/ui"
import { isStudyStep } from "./registration-copy.js"
import { registrationStateAtom } from "./state.js"
import { AccountStep } from "./steps/account-step.js"
import { ChoosingMethod } from "./steps/choosing-method.js"
import { ProblemStep } from "./steps/problem-step.js"
import { ProfileStep } from "./steps/profile-step.js"
import { StudyStepPage } from "./steps/study-step.js"
import { ConfirmGoogle, EmailVerification } from "./steps/verification-steps.js"

const onboardingSteps = new Set<RegistrationStep>([
  "problem",
  "country",
  "study-type",
  "institution",
  "degree",
  "subject",
  "profile",
  "account",
  "verify",
  "confirm-google",
])

function OnboardingSteps({ state, requestedStep }: {
  readonly state: Extract<RegistrationState, { readonly _tag: "CollectingOnboarding" | "ConfirmingGoogle" }>
  readonly requestedStep?: RegistrationStep
}) {
  const draft = state.draft
  const step = state._tag === "ConfirmingGoogle" ? "confirm-google" : (requestedStep ?? state.step)
  if (step === "problem") return <ProblemStep draft={draft} />
  if (isStudyStep(step)) return <StudyStepPage draft={draft} step={step} />
  if (step === "profile") return <ProfileStep draft={draft} />
  if (step === "account") return <AccountStep draft={draft} />
  return <ConfirmGoogle draft={draft} />
}

/** Connected registration feature. It consumes stable atoms directly instead of an action bag. */
export function RegistrationOnboarding({ url = { step: "start", path: [], valid: true } }: {
  readonly url?: RegistrationUrlState
}) {
  const state = useAtomValue(registrationStateAtom)
  const requestedStep = onboardingSteps.has(url.step) ? url.step : undefined

  switch (state._tag) {
    case "ChoosingMethod": return <ChoosingMethod />
    case "ResolvingGoogle": return <main aria-busy="true"><Heading level={1}>Conectando con Google…</Heading></main>
    case "EmailVerificationPending": return <EmailVerification state={state} />
    case "Completed": return <main><Heading level={1}>¡Todo listo!</Heading><Text>Tu cuenta está activa.</Text></main>
    case "CollectingOnboarding":
    case "ConfirmingGoogle":
      return <OnboardingSteps state={state} {...(requestedStep === undefined ? {} : { requestedStep })} />
  }
}
