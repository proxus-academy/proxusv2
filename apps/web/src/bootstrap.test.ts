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
import { browserHistory } from "./platform/routing/browser-history.web.js"
import { router } from "./routes/router.js"
import { navigateAction } from "./routes/navigation.js"

describe("web application bootstrap", () => {
  it("uses the Effect router from application workflows", () => Effect.runPromise(Effect.gen(function*() {
    const registry = AtomRegistry.make()
    const stop = router.start(registry, browserHistory)

    registry.set(openPasswordRecoveryAction, { email: "student@example.com" })
    yield* AtomRegistry.getResult(registry, openPasswordRecoveryAction, { suspendOnWaiting: true })
    expect(location.pathname).toMatch(/^\/(es|en)\/password-recovery$/)

    registry.set(backToLoginAction, undefined)
    yield* AtomRegistry.getResult(registry, backToLoginAction, { suspendOnWaiting: true })
    expect(location.pathname).toMatch(/^\/(es|en)\/login$/)
    stop()
  })))

  it("navigates from the single typed action atom", () => Effect.runPromise(Effect.gen(function*() {
    const registry = AtomRegistry.make()
    const stop = router.start(registry, browserHistory)

    registry.set(navigateAction, { id: "home" })
    yield* AtomRegistry.getResult(registry, navigateAction, { suspendOnWaiting: true })

    expect(location.pathname).toMatch(/^\/(es|en)\/app$/)
    stop()
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
