import {
  registrationDraftStorageVersion,
  registrationDraftTtlMs,
  StoredRegistrationDraft,
  type RegistrationDraftStorage,
} from "@proxus/frontend-core/registration"
import { Schema } from "effect"

export interface StringSessionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const makeWebRegistrationDraftStorage = (
  storage: StringSessionStorage,
  key = "proxus.registration-draft",
): RegistrationDraftStorage => ({
  load: (now) => {
    try {
      const encoded = storage.getItem(key)
      if (encoded === null) return undefined
      const record = Schema.decodeUnknownOption(Schema.fromJsonString(StoredRegistrationDraft))(encoded)
      if (record._tag === "None" || now - record.value.savedAt > registrationDraftTtlMs || record.value.savedAt > now) {
        storage.removeItem(key)
        return undefined
      }
      return record.value.draft
    } catch {
      return undefined
    }
  },
  save: (draft, now) => {
    try {
      const encoded = Schema.encodeSync(Schema.fromJsonString(StoredRegistrationDraft))({
        version: registrationDraftStorageVersion, savedAt: now, draft,
      })
      storage.setItem(key, encoded)
      return true
    } catch {
      return false
    }
  },
  clear: () => {
    try { storage.removeItem(key); return true } catch { return false }
  },
})
