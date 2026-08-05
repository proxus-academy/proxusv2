export type AppRoute =
  | { readonly _tag: "Root" }
  | { readonly _tag: "Registration" }
  | { readonly _tag: "Dashboard" }
  | { readonly _tag: "NotFound"; readonly path: string }

export interface RegistrationDraft {
  readonly email: string
  readonly displayName: string
}

export interface RegistrationErrors {
  readonly email?: string
  readonly displayName?: string
}

export type RegistrationState =
  | {
      readonly _tag: "Editing"
      readonly draft: RegistrationDraft
      readonly touched: ReadonlySet<keyof RegistrationDraft>
      readonly errors: RegistrationErrors
    }
  | {
      readonly _tag: "Submitting"
      readonly draft: RegistrationDraft
    }
  | {
      readonly _tag: "Failed"
      readonly draft: RegistrationDraft
      readonly error: string
    }

export interface StudySummary {
  readonly id: string
  readonly name: string
}

export type StudiesState =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Success"; readonly studies: ReadonlyArray<StudySummary> }
  | { readonly _tag: "Refreshing"; readonly studies: ReadonlyArray<StudySummary> }
  | { readonly _tag: "Failure"; readonly error: string; readonly previous?: ReadonlyArray<StudySummary> | undefined }

export type AppModel =
  | {
      readonly _tag: "Booting"
      readonly requestedRoute: AppRoute
    }
  | {
      readonly _tag: "Onboarding"
      readonly registration: RegistrationState
    }
  | {
      readonly _tag: "Dashboard"
      readonly user: { readonly displayName: string; readonly email: string }
      readonly studies: StudiesState
    }
  | {
      readonly _tag: "NotFound"
      readonly path: string
    }

export interface PersistedSnapshot {
  readonly registrationDraft?: RegistrationDraft | undefined
  readonly user?: { readonly displayName: string; readonly email: string } | undefined
}

export const emptyRegistrationDraft: RegistrationDraft = { email: "", displayName: "" }

export const editingRegistration = (draft: RegistrationDraft = emptyRegistrationDraft): RegistrationState => ({
  _tag: "Editing",
  draft,
  touched: new Set(),
  errors: {},
})
