import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { toStudyCatalogViewState } from "@proxus/frontend-core/study-catalog"
import type { RegistrationDraft, RegistrationStep } from "@proxus/frontend-core/registration"
import { CompleteGoogleRegistrationInput, GoogleCallbackInput, RegisterWithEmailInput, ResendVerificationInput, VerifyEmailInput } from "@proxus/shared/auth"
import { Schema } from "effect"
import { useEffect, useState } from "react"
import { composition } from "../../composition.js"
import { RegistrationOnboardingView } from "./onboarding-flow.js"

const failedBusy = (values: ReadonlyArray<{ readonly waiting: boolean }>) => values.some((value) => value.waiting)
const assignLocation = (url: string) => window.location.assign(url)
const onboardingSteps = new Set<RegistrationStep>(["problem", "country", "study-type", "institution", "degree", "subject", "profile", "account", "verify", "confirm-google"])

const onboardingOf = (draft: RegistrationDraft) => {
  const [country, studyType, university, degree, subject] = draft.path
  if (draft.username === undefined || draft.birthYear === undefined || draft.problemKind === undefined || country === undefined || studyType === undefined || university === undefined || degree === undefined || subject === undefined) return undefined
  return { username: draft.username, birthYear: draft.birthYear, problemKind: draft.problemKind, ...(draft.problemOtherText === undefined ? {} : { problemOtherText: draft.problemOtherText }), study: { countryId: country.id, studyTypeId: studyType.id, universityId: university.id, degreeId: degree.id, subjectId: subject.id } }
}

/** State-management boundary for the complete registration feature. */
export function RegistrationScreen() {
  const location = useAtomValue(composition.router.location)
  const url = useAtomValue(composition.registrationWizard.urlStateAtom)
  const state = useAtomValue(composition.registrationFlow.stateAtom)
  const dispatch = useAtomSet(composition.registrationFlow.dispatchAtom)
  const navigate = useAtomSet(composition.registrationWizard.pushAtom)
  const registerEmail = useAtomSet(composition.auth.registerWithEmailAtom)
  const registerResult = useAtomValue(composition.auth.registerWithEmailAtom)
  const verifyEmail = useAtomSet(composition.auth.verifyEmailAtom)
  const verifyResult = useAtomValue(composition.auth.verifyEmailAtom)
  const resendVerification = useAtomSet(composition.auth.resendVerificationAtom)
  const startGoogle = useAtomSet(composition.auth.startGoogleAtom)
  const googleStartResult = useAtomValue(composition.auth.startGoogleAtom)
  const completeGoogleCallback = useAtomSet(composition.auth.completeGoogleCallbackAtom)
  const googleCallbackResult = useAtomValue(composition.auth.completeGoogleCallbackAtom)
  const completeGoogleRegistration = useAtomSet(composition.auth.completeGoogleRegistrationAtom)
  const googleRegistrationResult = useAtomValue(composition.auth.completeGoogleRegistrationAtom)
  const [verificationEmail, setVerificationEmail] = useState("")
  const [googleDraft, setGoogleDraft] = useState<{ readonly registrationId: string; readonly email: string }>()
  const parent = state._tag === "CollectingOnboarding" || state._tag === "ConfirmingGoogle" ? state.draft.path.at(-1) : undefined
  const studyOptions = useAtomValue(parent === undefined ? composition.studyCatalog.rootsAtom : composition.studyCatalog.childrenFamily(parent.id))

  useEffect(() => {
    const query = new URLSearchParams(location.search)
    const code = query.get("code"); const oauthState = query.get("state")
    if (code === null || oauthState === null) return
    completeGoogleCallback({ input: Schema.decodeUnknownSync(GoogleCallbackInput)({ code, state: oauthState }), onSuccess: (result) => {
      if (result._tag === "ExistingGoogleSession") dispatch({ _tag: "GoogleResolved", result: { _tag: "Existing", session: result.session } })
      else { setGoogleDraft({ registrationId: result.registrationId, email: result.email }); dispatch({ _tag: "GoogleResolved", result: { _tag: "New" } }) }
    } })
  }, [completeGoogleCallback, dispatch, location.search])

  const requestedStep = onboardingSteps.has(url.step) ? url.step : undefined
  return <RegistrationOnboardingView state={state} studyOptions={toStudyCatalogViewState(studyOptions)} {...(googleDraft === undefined ? {} : { googleEmail: googleDraft.email })} busy={failedBusy([registerResult, verifyResult, googleStartResult, googleCallbackResult, googleRegistrationResult])} {...(requestedStep === undefined ? {} : { requestedStep })} actions={{
    dispatch,
    navigate: (step) => navigate({ step, path: state._tag === "CollectingOnboarding" || state._tag === "ConfirmingGoogle" ? state.draft.path : [] }),
    startGoogle: () => { dispatch({ _tag: "GoogleStarted" }); startGoogle(assignLocation) },
    submitEmail: (credentials) => {
      if (state._tag !== "CollectingOnboarding") return
      const onboarding = onboardingOf(state.draft); if (onboarding === undefined) return
      setVerificationEmail(credentials.email)
      registerEmail({ input: Schema.decodeUnknownSync(RegisterWithEmailInput)({ ...credentials, onboarding }), onSuccess: () => dispatch({ _tag: "EmailSubmitted", draftId: credentials.email, maskedEmail: credentials.email }) })
    },
    verifyCode: (code) => verifyEmail({ input: Schema.decodeUnknownSync(VerifyEmailInput)({ email: verificationEmail, code }), onSuccess: (session) => dispatch({ _tag: "CodeVerified", session }) }),
    resendCode: () => verificationEmail !== "" && resendVerification(Schema.decodeUnknownSync(ResendVerificationInput)({ email: verificationEmail })),
    confirmGoogle: () => {
      if (state._tag !== "ConfirmingGoogle" || googleDraft === undefined) return
      const onboarding = onboardingOf(state.draft); if (onboarding === undefined) return
      completeGoogleRegistration({ input: Schema.decodeUnknownSync(CompleteGoogleRegistrationInput)({ registrationId: googleDraft.registrationId, onboarding }), onSuccess: (session) => dispatch({ _tag: "GoogleConfirmed", session }) })
    },
    login: () => navigate({ step: "start", path: [] }),
  }} />
}
