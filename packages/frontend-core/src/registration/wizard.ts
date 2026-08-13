import { AcquisitionSource, ProblemKind, type CurrentSession } from "@proxus/shared/auth"
import type { StudyNode } from "@proxus/shared/study-catalog"
import { Schema } from "effect"
import { RegistrationPath } from "./model.js"
import { appendRegistrationNode } from "./transitions.js"

export const RegistrationStepParam = Schema.Literals([
  "start", "problem", "problem-other", "study", "profile", "discovery", "account", "verify", "confirm-google",
])
export type RegistrationStep = typeof RegistrationStepParam.Type

export const RegistrationDraft = Schema.Struct({
  provider: Schema.Literals(["email", "google"]),
  problemKind: Schema.optional(ProblemKind),
  problemOtherText: Schema.optional(Schema.String),
  acquisitionSource: Schema.optional(AcquisitionSource),
  acquisitionOtherText: Schema.optional(Schema.String),
  path: RegistrationPath,
  username: Schema.optional(Schema.String),
  birthYear: Schema.optional(Schema.Number),
})
export type RegistrationDraft = typeof RegistrationDraft.Type

export interface GooglePendingRegistration {
  readonly registrationId: string
  readonly email: string
}

export type RegistrationState =
  | { readonly _tag: "ChoosingMethod" }
  | { readonly _tag: "ResolvingGoogle" }
  | {
    readonly _tag: "CollectingOnboarding"
    readonly draft: RegistrationDraft
    readonly step: RegistrationStep
    readonly googleRegistration?: GooglePendingRegistration
  }
  | { readonly _tag: "EmailVerificationPending"; readonly draftId: string; readonly maskedEmail: string }
  | {
    readonly _tag: "ConfirmingGoogle"
    readonly draft: RegistrationDraft
    readonly googleRegistration: GooglePendingRegistration
  }
  | { readonly _tag: "Completed"; readonly session: CurrentSession }

export type GoogleResolution =
  | { readonly _tag: "Existing"; readonly session: CurrentSession }
  | ({ readonly _tag: "New" } & GooglePendingRegistration)
  | { readonly _tag: "Conflict" }

export type RegistrationEvent =
  | { readonly _tag: "EmailStarted" }
  | { readonly _tag: "GoogleStarted" }
  | { readonly _tag: "GoogleResolved"; readonly result: GoogleResolution }
  | { readonly _tag: "ProblemSelected"; readonly kind: ProblemKind; readonly otherText?: string }
  | { readonly _tag: "StudyNodeSelected"; readonly node: StudyNode }
  | { readonly _tag: "StudyPathChanged"; readonly path: RegistrationPath }
  | { readonly _tag: "StepEdited"; readonly step: RegistrationStep }
  | { readonly _tag: "ProfileCompleted"; readonly username: string; readonly birthYear: number }
  | { readonly _tag: "AcquisitionSelected"; readonly source: AcquisitionSource; readonly otherText?: string }
  | { readonly _tag: "EmailSubmitted"; readonly draftId: string; readonly maskedEmail: string }
  | { readonly _tag: "GoogleConfirmed"; readonly session: CurrentSession }
  | { readonly _tag: "CodeVerified"; readonly session: CurrentSession }
  | { readonly _tag: "Cancelled" }

/** Adds the next graph node; changing an ancestor uses StudyPathChanged. */
export const selectStudyNode = (path: RegistrationPath, node: StudyNode): RegistrationPath =>
  appendRegistrationNode(path, node)

const problemComplete = (draft: RegistrationDraft) => {
  if (draft.problemKind === undefined) return false
  if (draft.problemKind !== "other") return draft.problemOtherText === undefined || draft.problemOtherText.trim().length === 0
  const length = draft.problemOtherText?.trim().length ?? 0
  return length > 0 && length <= 280
}
const profileComplete = (draft: RegistrationDraft) => draft.username !== undefined && draft.birthYear !== undefined
const acquisitionComplete = (draft: RegistrationDraft) =>
  draft.acquisitionSource !== undefined
  && (draft.acquisitionSource !== "other" || (draft.acquisitionOtherText?.trim().length ?? 0) > 0)

export const firstIncompleteStep = (draft: RegistrationDraft): RegistrationStep => {
  if (!problemComplete(draft)) return "problem"
  if (draft.path.at(-1)?.kind !== "subject") return "study"
  if (!profileComplete(draft)) return "profile"
  if (!acquisitionComplete(draft)) return "discovery"
  return draft.provider === "google" ? "confirm-google" : "account"
}

const order = {
  start: 0, problem: 1, "problem-other": 1, study: 2, profile: 3, discovery: 4,
  account: 5, "confirm-google": 5, verify: 6,
} satisfies Readonly<Record<RegistrationStep, number>>

/** URL steps may move backwards, but never past the first unmet prerequisite. */
export const guardRegistrationStep = (requested: RegistrationStep, draft: RegistrationDraft): RegistrationStep => {
  if (requested === "start") return requested
  const reachable = firstIncompleteStep(draft)
  if (requested === "verify") return reachable
  if (requested === "account" && draft.provider !== "email") return reachable
  if (requested === "confirm-google" && draft.provider !== "google") return reachable
  return order[requested] <= order[reachable] ? requested : reachable
}

const collecting = (
  draft: RegistrationDraft,
  googleRegistration?: GooglePendingRegistration,
): RegistrationState => ({
  _tag: "CollectingOnboarding",
  draft,
  step: firstIncompleteStep(draft),
  ...(googleRegistration === undefined ? undefined : { googleRegistration }),
})

export const transitionRegistration = (state: RegistrationState, event: RegistrationEvent): RegistrationState => {
  switch (state._tag) {
    case "ChoosingMethod":
      switch (event._tag) {
        case "EmailStarted": return collecting({ provider: "email", path: [] })
        case "GoogleStarted": return { _tag: "ResolvingGoogle" }
        default: return state
      }
    case "ResolvingGoogle":
      if (event._tag === "Cancelled") return { _tag: "ChoosingMethod" }
      if (event._tag !== "GoogleResolved") return state
      switch (event.result._tag) {
        case "Existing": return { _tag: "Completed", session: event.result.session }
        case "New": return collecting(
          { provider: "google", path: [] },
          { registrationId: event.result.registrationId, email: event.result.email },
        )
        case "Conflict": return { _tag: "ChoosingMethod" }
      }
    case "CollectingOnboarding": {
      if (event._tag === "Cancelled") return { _tag: "ChoosingMethod" }
      if (event._tag === "ProblemSelected") {
        const text = event.otherText?.trim()
        if (event.kind === "other" && (text === undefined || text.length === 0 || text.length > 280)) return state
        if (event.kind !== "other" && text !== undefined && text.length > 0) return state
        return collecting(text === undefined
          ? { ...state.draft, problemKind: event.kind }
          : { ...state.draft, problemKind: event.kind, problemOtherText: text },
        state.googleRegistration)
      }
      if (event._tag === "StudyNodeSelected") {
        return collecting(
          { ...state.draft, path: selectStudyNode(state.draft.path, event.node) },
          state.googleRegistration,
        )
      }
      if (event._tag === "StudyPathChanged" && Schema.is(RegistrationPath)(event.path)) {
        return { ...state, draft: { ...state.draft, path: event.path }, step: "study" }
      }
      if (event._tag === "StepEdited") {
        return { ...state, step: guardRegistrationStep(event.step, state.draft) }
      }
      if (event._tag === "ProfileCompleted") {
        const draft = { ...state.draft, username: event.username, birthYear: event.birthYear }
        return draft.provider === "google"
          && firstIncompleteStep(draft) === "confirm-google"
          && state.googleRegistration !== undefined
          ? { _tag: "ConfirmingGoogle", draft, googleRegistration: state.googleRegistration }
          : collecting(draft, state.googleRegistration)
      }
      if (event._tag === "AcquisitionSelected") {
        const text = event.otherText?.trim()
        if (event.source === "other" && (text === undefined || text.length === 0 || text.length > 200)) return state
        if (event.source !== "other" && text !== undefined && text.length > 0) return state
        const draft = {
          ...state.draft,
          acquisitionSource: event.source,
          ...(text === undefined ? { acquisitionOtherText: undefined } : { acquisitionOtherText: text }),
        }
        return draft.provider === "google"
          && firstIncompleteStep(draft) === "confirm-google"
          && state.googleRegistration !== undefined
          ? { _tag: "ConfirmingGoogle", draft, googleRegistration: state.googleRegistration }
          : collecting(draft, state.googleRegistration)
      }
      if (event._tag === "EmailSubmitted" && state.draft.provider === "email" && firstIncompleteStep(state.draft) === "account") {
        return { _tag: "EmailVerificationPending", draftId: event.draftId, maskedEmail: event.maskedEmail }
      }
      return state
    }
    case "ConfirmingGoogle":
      if (event._tag === "GoogleConfirmed") return { _tag: "Completed", session: event.session }
      if (event._tag === "Cancelled") return collecting(state.draft, state.googleRegistration)
      return state
    case "EmailVerificationPending":
      return event._tag === "CodeVerified" ? { _tag: "Completed", session: event.session } : state
    case "Completed": return state
  }
}

/** Restores a persisted draft without exposing storage concerns to React. */
export const restoredRegistrationState = (draft: RegistrationDraft): RegistrationState => ({
  _tag: "CollectingOnboarding",
  draft,
  step: firstIncompleteStep(draft),
})

/** Existing Google sessions complete directly and never create an onboarding draft. */
export const resolveGoogleState = (
  state: RegistrationState,
  event: Extract<RegistrationEvent, { readonly _tag: "GoogleResolved" }>,
): RegistrationState => transitionRegistration(state, event)
