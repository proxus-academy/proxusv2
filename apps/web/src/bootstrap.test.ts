// @vitest-environment happy-dom
// @effect-diagnostics strictEffectProvide:off
import {
  clearRegistrationDraft,
  loadRegistrationDraft,
  saveRegistrationDraft,
  type RegistrationDraft,
} from "@proxus/frontend-core/registration"
import { Effect } from "effect"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { registrationDraftStorageLayer } from "./modules/registration/state.js"

describe("web application bootstrap", () => {
  it("persists an unexpired onboarding draft in the Effect session storage layer", () => {
    const draft: RegistrationDraft = { provider: "email", path: [] }
    const restored = Effect.runSync(Effect.gen(function*() {
      yield* saveRegistrationDraft(draft, 1_000)
      const value = yield* loadRegistrationDraft(1_001)
      yield* clearRegistrationDraft
      return value
    }).pipe(Effect.provide(registrationDraftStorageLayer)))
    expect(restored).toEqual(draft)
  })
})
