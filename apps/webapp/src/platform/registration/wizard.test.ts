// @effect-diagnostics strictEffectProvide:off
import {
  loadRegistrationDraft,
  registrationDraftStorageKey,
  registrationDraftTtlMs,
  saveRegistrationDraft,
} from "@proxus/frontend-core/registration"
import { makeSubjectNodeId } from "@proxus/shared/study-catalog"
import { DateTime, Effect, Exit } from "effect"
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore"
import { describe, expect, it } from "vitest"
import { decodeRegistrationQuery, encodeRegistrationQuery } from "./wizard-url.js"

describe("registration web codecs and draft", () => {
  it("rejects invalid deep links without consuming campaign", () => {
    const decoded = decodeRegistrationQuery("campaign=summer&step=verify&path=not-json")
    expect(decoded).toEqual({ step: "verify", nodeIds: [], valid: false })
    expect(new URLSearchParams("campaign=summer&step=verify&path=not-json").get("campaign")).toBe("summer")
  })

  it("encodes wizard state while preserving attribution parameters", () => {
    const encoded = encodeRegistrationQuery(
      "campaign=summer&ref=teacher&code=secret",
      "study",
      [{
        id: makeSubjectNodeId("20000000-0000-4000-8000-000000000005"),
        kind: "subject",
        name: "Math",
        imageAssetId: null,
        status: "published" as const,
        createdAt: DateTime.makeUnsafe(0),
        updatedAt: DateTime.makeUnsafe(0),
      }],
    )
    const search = new URLSearchParams(encoded)
    expect(search.get("campaign")).toBe("summer")
    expect(search.get("ref")).toBe("teacher")
    expect(search.get("code")).toBe("secret")
    expect(search.get("step")).toBe("study")
    expect(decodeRegistrationQuery(encoded)).toMatchObject({ step: "study", valid: true })
  })

  it("removes default wizard parameters without touching attribution", () => {
    const encoded = encodeRegistrationQuery("campaign=summer&step=study&path=[]", "start", [])
    expect(new URLSearchParams(encoded).toString()).toBe("campaign=summer")
  })

  it("round-trips a versioned session draft and expires it", () => {
    const draft = { provider: "email" as const, path: [] as const, problemKind: "prepare-exams" as const }
    const result = Effect.runSync(Effect.gen(function*() {
      yield* saveRegistrationDraft(draft, 100)
      const restored = yield* loadRegistrationDraft(100)
      const expired = yield* loadRegistrationDraft(101 + registrationDraftTtlMs)
      const storage = yield* KeyValueStore.KeyValueStore
      return { restored, expired, remains: yield* storage.has(registrationDraftStorageKey) }
    }).pipe(Effect.provide(KeyValueStore.layerMemory)))
    expect(result).toEqual({ restored: draft, expired: undefined, remains: false })
  })

  it("drops unknown versions and malformed records", () => {
    const result = Effect.runSync(Effect.gen(function*() {
      const storage = yield* KeyValueStore.KeyValueStore
      yield* storage.set(
        registrationDraftStorageKey,
        '{"version":999,"savedAt":1,"draft":{"provider":"email","path":[]}}',
      )
      const restored = yield* loadRegistrationDraft(1)
      return { restored, remains: yield* storage.has(registrationDraftStorageKey) }
    }).pipe(Effect.provide(KeyValueStore.layerMemory)))
    expect(result).toEqual({ restored: undefined, remains: false })
  })

  it("degrades safely when sessionStorage is unavailable", () => {
    const unavailableStorage: Storage = {
      length: 0,
      clear: () => { throw new Error("blocked") },
      getItem: () => { throw new Error("blocked") },
      key: () => { throw new Error("blocked") },
      setItem: () => { throw new Error("blocked") },
      removeItem: () => { throw new Error("blocked") },
    }
    const unavailable = KeyValueStore.layerStorage(() => unavailableStorage)
    const restored = Effect.runSync(loadRegistrationDraft(0).pipe(Effect.provide(unavailable)))
    const saved = Effect.runSync(
      Effect.exit(saveRegistrationDraft({ provider: "email", path: [] }, 0)).pipe(
        Effect.provide(unavailable),
      ),
    )
    expect(restored).toBeUndefined()
    expect(Exit.isFailure(saved)).toBe(true)
  })
})
