import { ProblemKind, type CurrentSession } from "@proxus/shared/auth"
import type { StudyNode } from "@proxus/shared/study-catalog"
import { Schema } from "effect"
import { RegistrationPath } from "./model.js"

export const RegistrationStepParam = Schema.Literals([
  "start", "problem", "country", "study-type", "institution", "degree", "subject",
  "profile", "account", "verify", "confirm-google",
])
export type RegistrationStep = typeof RegistrationStepParam.Type

export const RegistrationDraft = Schema.Struct({
  provider: Schema.Literals(["email", "google"]),
  problemKind: Schema.optional(ProblemKind),
  problemOtherText: Schema.optional(Schema.String),
  path: RegistrationPath,
  username: Schema.optional(Schema.String),
  birthYear: Schema.optional(Schema.Number),
})
export type RegistrationDraft = typeof RegistrationDraft.Type

export type RegistrationState =
  | { readonly _tag: "ChoosingMethod" }
  | { readonly _tag: "ResolvingGoogle" }
  | { readonly _tag: "CollectingOnboarding"; readonly draft: RegistrationDraft; readonly step: RegistrationStep }
  | { readonly _tag: "EmailVerificationPending"; readonly draftId: string; readonly maskedEmail: string }
  | { readonly _tag: "ConfirmingGoogle"; readonly draft: RegistrationDraft }
  | { readonly _tag: "Completed"; readonly session: CurrentSession }

export type GoogleResolution =
  | { readonly _tag: "Existing"; readonly session: CurrentSession }
  | { readonly _tag: "New" }
  | { readonly _tag: "Conflict" }

export type RegistrationEvent =
  | { readonly _tag: "EmailStarted" }
  | { readonly _tag: "GoogleStarted" }
  | { readonly _tag: "GoogleResolved"; readonly result: GoogleResolution }
  | { readonly _tag: "ProblemSelected"; readonly kind: ProblemKind; readonly otherText?: string }
  | { readonly _tag: "StudyNodeSelected"; readonly node: StudyNode }
  | { readonly _tag: "ProfileCompleted"; readonly username: string; readonly birthYear: number }
  | { readonly _tag: "EmailSubmitted"; readonly draftId: string; readonly maskedEmail: string }
  | { readonly _tag: "GoogleConfirmed"; readonly session: CurrentSession }
  | { readonly _tag: "CodeVerified"; readonly session: CurrentSession }
  | { readonly _tag: "Cancelled" }

const kindIndex: Readonly<Record<StudyNode["kind"], number>> = {
  country: 0, type: 1, university: 2, degree: 3, subject: 4,
}

/** Selecting an ancestor replaces it and discards every incompatible descendant. */
export const selectStudyNode = (path: RegistrationPath, node: StudyNode): RegistrationPath => {
  const index = kindIndex[node.kind]
  const candidate = [...path.slice(0, index), node]
  return Schema.is(RegistrationPath)(candidate) ? candidate : path
}

const problemComplete = (draft: RegistrationDraft) => {
  if (draft.problemKind === undefined) return false
  if (draft.problemKind !== "other") return draft.problemOtherText === undefined || draft.problemOtherText.trim().length === 0
  const length = draft.problemOtherText?.trim().length ?? 0
  return length > 0 && length <= 280
}
const profileComplete = (draft: RegistrationDraft) => draft.username !== undefined && draft.birthYear !== undefined

export const firstIncompleteStep = (draft: RegistrationDraft): RegistrationStep => {
  if (!problemComplete(draft)) return "problem"
  const studySteps = ["country", "study-type", "institution", "degree", "subject"] as const
  const nextStudyStep = studySteps.at(draft.path.length)
  if (nextStudyStep !== undefined) return nextStudyStep
  if (!profileComplete(draft)) return "profile"
  return draft.provider === "google" ? "confirm-google" : "account"
}

const order: Readonly<Record<RegistrationStep, number>> = {
  start: 0, problem: 1, country: 2, "study-type": 3, institution: 4, degree: 5,
  subject: 6, profile: 7, account: 8, "confirm-google": 8, verify: 9,
}

/** URL steps may move backwards, but never past the first unmet prerequisite. */
export const guardRegistrationStep = (requested: RegistrationStep, draft: RegistrationDraft): RegistrationStep => {
  if (requested === "start") return requested
  const reachable = firstIncompleteStep(draft)
  if (requested === "verify") return reachable
  if (requested === "account" && draft.provider !== "email") return reachable
  if (requested === "confirm-google" && draft.provider !== "google") return reachable
  return order[requested] <= order[reachable] ? requested : reachable
}

const collecting = (draft: RegistrationDraft): RegistrationState => ({
  _tag: "CollectingOnboarding", draft, step: firstIncompleteStep(draft),
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
        case "New": return collecting({ provider: "google", path: [] })
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
          : { ...state.draft, problemKind: event.kind, problemOtherText: text })
      }
      if (event._tag === "StudyNodeSelected") return collecting({ ...state.draft, path: selectStudyNode(state.draft.path, event.node) })
      if (event._tag === "ProfileCompleted") {
        const draft = { ...state.draft, username: event.username, birthYear: event.birthYear }
        return draft.provider === "google" && firstIncompleteStep(draft) === "confirm-google"
          ? { _tag: "ConfirmingGoogle", draft }
          : collecting(draft)
      }
      if (event._tag === "EmailSubmitted" && state.draft.provider === "email" && firstIncompleteStep(state.draft) === "account") {
        return { _tag: "EmailVerificationPending", draftId: event.draftId, maskedEmail: event.maskedEmail }
      }
      return state
    }
    case "ConfirmingGoogle":
      if (event._tag === "GoogleConfirmed") return { _tag: "Completed", session: event.session }
      if (event._tag === "Cancelled") return collecting(state.draft)
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
