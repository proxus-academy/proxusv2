import {
  completeGoogleCallbackAction,
  completeGoogleRegistrationAction,
  registerWithEmailAction,
  resendVerificationAction,
  startGoogleAuthorizationAction,
  verifyEmailAction,
} from "@proxus/frontend-core/auth"
import {
  makeRegistrationFlowAtoms,
  type RegistrationDraft,
  type RegistrationStep,
} from "@proxus/frontend-core/registration"
import { DocumentNavigation } from "@proxus/frontend-core/navigation"
import {
  CompleteGoogleRegistrationInput,
  GoogleCallbackInput,
  RegisterWithEmailInput,
  ResendVerificationInput,
  VerifyEmailInput,
} from "@proxus/shared/auth"
import { Cause, Effect, Option, Schema } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"
import {
  currentSearch,
  replaceSearch,
  navigateAction,
} from "../../routes/navigation.js"
import { navigationRuntime } from "../../routes/navigation-runtime.js"
import { changeRegistrationStep } from "../../platform/registration/wizard-url.js"
import {
  registrationCompletedAnalyticsAction,
  registrationStartedAnalyticsAction,
} from "./feature-flags.js"

export const registrationDraftStorageLayer = KeyValueStore.layerStorage(
  () => localStorage,
)
const registrationFlow = makeRegistrationFlowAtoms({
  storageLayer: registrationDraftStorageLayer,
  now: () => performance.timeOrigin + performance.now(),
  navigate: (step, state) => changeRegistrationStep(
      "push",
      step,
      state._tag === "CollectingOnboarding" || state._tag === "ConfirmingGoogle"
        ? state.draft.path
        : [],
    ),
})

export const registrationStateAtom = registrationFlow.stateAtom
export const registrationDraftRestoreLifecycleAtom = registrationFlow.restoreLifecycleAtom
export const dispatchRegistrationAction = registrationFlow.dispatchAtom
const processedGoogleCallbackAtom = Atom.make<string | undefined>(undefined)

const onboardingOf = (draft: RegistrationDraft) => {
  const subject = draft.path.at(-1)
  if (
    draft.username === undefined
    || draft.birthYear === undefined
    || draft.problemKind === undefined
    || draft.acquisitionSource === undefined
    || subject === undefined
    || subject.kind !== "subject"
  ) return undefined
  return {
    username: draft.username,
    birthYear: draft.birthYear,
    problemKind: draft.problemKind,
    ...(typeof draft.problemOtherText === "string" ? { problemOtherText: draft.problemOtherText } : {}),
    acquisitionSource: draft.acquisitionSource,
    ...(typeof draft.acquisitionOtherText === "string"
      ? { acquisitionOtherText: draft.acquisitionOtherText }
      : {}),
    study: {
      subjectId: subject.id,
    },
  }
}

export const beginEmailRegistrationAction = Atom.fn<void>()((_input, get) => Effect.gen(function*() {
  yield* get.setResult(registrationStartedAnalyticsAction, undefined)
  yield* get.setResult(dispatchRegistrationAction, { _tag: "EmailStarted" })
}))

export const beginGoogleRegistrationAction = navigationRuntime.fn((
  request: { readonly requestId: string },
  get,
) => Effect.gen(function*() {
  const documentNavigation = yield* DocumentNavigation
  yield* get.setResult(registrationStartedAnalyticsAction, undefined)
  yield* get.setResult(dispatchRegistrationAction, { _tag: "GoogleStarted" })
  const authorization = yield* get.setResult(startGoogleAuthorizationAction, request)
  yield* documentNavigation.assign(authorization.authorizationUrl)
}))

export const submitEmailRegistrationAction = Atom.fn<{
  readonly email: string
  readonly password: string
}>()((credentials, get) => Effect.gen(function*() {
  const state = get(registrationStateAtom)
  if (state._tag !== "CollectingOnboarding") {
    return yield* Effect.fail({ _tag: "RegistrationStateNotCollecting" as const })
  }
  const onboarding = onboardingOf(state.draft)
  if (onboarding === undefined) {
    return yield* Effect.fail({ _tag: "RegistrationDraftIncomplete" as const })
  }
  const input = yield* Schema.decodeUnknownEffect(RegisterWithEmailInput)({ ...credentials, onboarding })
  yield* get.setResult(registerWithEmailAction, input)
  yield* get.setResult(dispatchRegistrationAction, {
    _tag: "EmailSubmitted",
    draftId: credentials.email,
    maskedEmail: credentials.email,
  })
}))

export const verifyRegistrationCodeAction = Atom.fn<{ readonly code: string }>()((input, get) => Effect.gen(function*() {
  const state = get(registrationStateAtom)
  if (state._tag !== "EmailVerificationPending") {
    return yield* Effect.fail({ _tag: "RegistrationVerificationNotPending" as const })
  }
  const request = yield* Schema.decodeUnknownEffect(VerifyEmailInput)({
    email: state.draftId,
    code: input.code,
  })
  const session = yield* get.setResult(verifyEmailAction, request)
  yield* get.setResult(dispatchRegistrationAction, { _tag: "CodeVerified", session })
  yield* get.setResult(registrationCompletedAnalyticsAction, undefined)
  yield* get.setResult(navigateAction, { id: "home", replace: true })
}))

export const resendRegistrationCodeAction = Atom.fn<void>()((_input, get) => Effect.gen(function*() {
  const state = get(registrationStateAtom)
  if (state._tag !== "EmailVerificationPending") {
    return yield* Effect.fail({ _tag: "RegistrationVerificationNotPending" as const })
  }
  const request = yield* Schema.decodeUnknownEffect(ResendVerificationInput)({ email: state.draftId })
  yield* get.setResult(resendVerificationAction, request)
}))

export const confirmGoogleRegistrationAction = Atom.fn<void>()((_input, get) => Effect.gen(function*() {
  const state = get(registrationStateAtom)
  if (state._tag !== "ConfirmingGoogle") return
  const onboarding = onboardingOf(state.draft)
  if (onboarding === undefined) return
  const input = yield* Schema.decodeUnknownEffect(CompleteGoogleRegistrationInput)({
    registrationId: state.googleRegistration.registrationId,
    onboarding,
  })
  const session = yield* get.setResult(completeGoogleRegistrationAction, input)
  yield* get.setResult(dispatchRegistrationAction, { _tag: "GoogleConfirmed", session })
  yield* get.setResult(registrationCompletedAnalyticsAction, undefined)
  yield* get.setResult(navigateAction, { id: "home", replace: true })
}))

export const resolveGoogleCallbackAction = navigationRuntime.fn((query: {
  readonly code: string
  readonly state: string
}, get) => Effect.gen(function*() {
  const key = `${query.code}:${query.state}`
  if (get(processedGoogleCallbackAtom) === key) return
  const input = yield* Schema.decodeUnknownEffect(GoogleCallbackInput)(query)
  const result = yield* get.setResult(completeGoogleCallbackAction, input)
  get.set(processedGoogleCallbackAtom, key)
  const search = currentSearch()
  search.delete("code")
  search.delete("state")
  yield* replaceSearch(Object.fromEntries(search))
  // OAuth returns through a full document navigation, so the in-memory state
  // starts at ChoosingMethod even though the user already initiated Google.
  if (get(registrationStateAtom)._tag === "ChoosingMethod") {
    yield* get.setResult(dispatchRegistrationAction, { _tag: "GoogleStarted" })
  }
  if (result._tag === "ExistingGoogleSession") {
    yield* get.setResult(dispatchRegistrationAction, {
      _tag: "GoogleResolved",
      result: { _tag: "Existing", session: result.session },
    })
    yield* get.setResult(navigateAction, { id: "home", replace: true })
    return
  }
  yield* get.setResult(dispatchRegistrationAction, {
    _tag: "GoogleResolved",
    result: {
      _tag: "New",
      registrationId: result.registrationId,
      email: result.email,
    },
  })
}))

export const googleCallbackLifecycleAtom = Atom.make((get) => {
  const search = currentSearch()
  const code = search.get("code")
  const state = search.get("state")
  return code === null || state === null
    ? Effect.void
    : get.setResult(resolveGoogleCallbackAction, { code, state })
})

export const editRegistrationStepAction = Atom.fn<RegistrationStep>()((step, get) => {
  const state = get(registrationStateAtom)
  const path: RegistrationDraft["path"] = state._tag === "CollectingOnboarding" || state._tag === "ConfirmingGoogle"
    ? state.draft.path
    : []
  return changeRegistrationStep("push", step, path)
})

export const changeRegistrationStudyPathAction = Atom.fn<RegistrationDraft["path"]>()((path, get) =>
  get.setResult(dispatchRegistrationAction, { _tag: "StudyPathChanged", path }))

const operationResults = (get: Atom.FnContext) => [
  get(beginGoogleRegistrationAction),
  get(submitEmailRegistrationAction),
  get(verifyRegistrationCodeAction),
  get(resendRegistrationCodeAction),
  get(confirmGoogleRegistrationAction),
  get(resolveGoogleCallbackAction),
]

export const registrationBusyAtom = Atom.make((get) => operationResults(get).some((result) => result.waiting))
export type RegistrationErrorCode = "conflict" | "invalidCode" | "network" | "unexpected"

export const registrationErrorCodeAtom = Atom.make<RegistrationErrorCode | undefined>((get) => {
  const errors = operationResults(get).flatMap((result) => {
    if (result._tag !== "Failure") return []
    const error = Cause.findErrorOption(result.cause as Cause.Cause<unknown>)
    return Option.isSome(error) ? [error.value] : []
  })
  const tags = errors.flatMap((error) =>
    typeof error === "object" && error !== null && "_tag" in error && typeof error._tag === "string"
      ? [error._tag]
      : [])
  if (tags.includes("AuthRegistrationConflict")) return "conflict"
  if (tags.includes("AuthCodeInvalid")) return "invalidCode"
  if (tags.includes("HttpClientError")) return "network"
  return errors.length > 0 ? "unexpected" : undefined
})
