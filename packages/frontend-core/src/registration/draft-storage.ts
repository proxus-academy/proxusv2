import { Schema } from "effect"
import { RegistrationDraft } from "./wizard.js"

export const registrationDraftStorageVersion = 1
export const registrationDraftTtlMs = 24 * 60 * 60 * 1_000

export const StoredRegistrationDraft = Schema.Struct({
  version: Schema.Literal(registrationDraftStorageVersion),
  savedAt: Schema.Number,
  draft: RegistrationDraft,
})

/** Storage is a fallible platform capability; malformed and expired records are treated as absent. */
export interface RegistrationDraftStorage {
  readonly load: (now: number) => RegistrationDraft | undefined
  readonly save: (draft: RegistrationDraft, now: number) => boolean
  readonly clear: () => boolean
}
