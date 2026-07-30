import { Effect, Option, Schema } from "effect"
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"
import { RegistrationDraft } from "./wizard.js"

export const registrationDraftStorageVersion = 1
export const registrationDraftTtlMs = 24 * 60 * 60 * 1_000
export const registrationDraftStorageKey = "proxus.registration-draft"

export const StoredRegistrationDraft = Schema.Struct({
  version: Schema.Literal(registrationDraftStorageVersion),
  savedAt: Schema.Number,
  draft: RegistrationDraft,
})

export const clearRegistrationDraft = Effect.gen(function*() {
  const storage = yield* KeyValueStore.KeyValueStore
  yield* storage.remove(registrationDraftStorageKey)
})

/** Malformed, unavailable and expired records are deliberately treated as absent. */
export const loadRegistrationDraft = (now: number): Effect.Effect<
  RegistrationDraft | undefined,
  never,
  KeyValueStore.KeyValueStore
> => Effect.gen(function*() {
  const keyValueStore = yield* KeyValueStore.KeyValueStore
  const storage = KeyValueStore.toSchemaStore(keyValueStore, StoredRegistrationDraft)
  return yield* storage.get(registrationDraftStorageKey).pipe(
    Effect.flatMap(Option.match({
      onNone: () => Effect.undefined,
      onSome: (record) => {
        if (record.savedAt > now || now - record.savedAt > registrationDraftTtlMs) {
          return Effect.as(clearRegistrationDraft, undefined)
        }
        return Effect.succeed(record.draft)
      },
    })),
    Effect.catch(() => Effect.as(Effect.ignore(clearRegistrationDraft), undefined)),
  )
})

export const saveRegistrationDraft = (
  draft: RegistrationDraft,
  now: number,
) => Effect.gen(function*() {
  const keyValueStore = yield* KeyValueStore.KeyValueStore
  const storage = KeyValueStore.toSchemaStore(keyValueStore, StoredRegistrationDraft)
  yield* storage.set(registrationDraftStorageKey, {
      version: registrationDraftStorageVersion,
      savedAt: now,
      draft,
  })
})
