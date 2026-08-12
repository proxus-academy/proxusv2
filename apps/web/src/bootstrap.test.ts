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
import {
  backToLoginAction,
  openPasswordRecoveryAction,
} from "./modules/auth/actions.js"
import { registrationDraftStorageLayer } from "./modules/registration/state.js"
import { router } from "./routes/router.js"
import { navigateAction } from "./routes/navigation.js"

describe("web application bootstrap", () => {
  it("uses TanStack Router through Effect application workflows", () => Effect.runPromise(Effect.gen(function*() {
    router.history.replace("/es")
    yield* Effect.promise(() => router.load())
    const registry = AtomRegistry.make()

    registry.set(openPasswordRecoveryAction, { email: "student@example.com" })
    yield* AtomRegistry.getResult(registry, openPasswordRecoveryAction, { suspendOnWaiting: true })
    expect(location.pathname).toMatch(/^\/(es|en)\/password-recovery$/)

    registry.set(backToLoginAction, undefined)
    yield* AtomRegistry.getResult(registry, backToLoginAction, { suspendOnWaiting: true })
    expect(location.pathname).toMatch(/^\/(es|en)\/login$/)
  })))

  it("navigates from the single typed action atom", () => Effect.runPromise(Effect.gen(function*() {
    router.history.replace("/es")
    yield* Effect.promise(() => router.load())
    const registry = AtomRegistry.make()

    registry.set(navigateAction, { id: "home" })
    yield* AtomRegistry.getResult(registry, navigateAction, { suspendOnWaiting: true })

    expect(location.pathname).toMatch(/^\/(es|en)\/app$/)
  })))

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
