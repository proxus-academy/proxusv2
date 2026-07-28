// @vitest-environment happy-dom
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import { Effect } from "effect"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import {
  backToLoginAction,
  openPasswordRecoveryAction,
} from "./modules/auth/actions.js"
import { registrationDraftStorage } from "./modules/registration/state.js"
import {
  canonicalizeLocaleAction,
  localeAtom,
  localeLifecycleAtom,
} from "./routes/router.js"

describe("web application bootstrap", () => {
  it("canonicalizes locale through the typed router", () => Effect.runPromise(Effect.gen(function*() {
    const registry = AtomRegistry.make()
    const unmount = registry.mount(localeLifecycleAtom)

    registry.set(canonicalizeLocaleAction, undefined)
    yield* AtomRegistry.getResult(registry, canonicalizeLocaleAction, { suspendOnWaiting: true })
    expect(location.pathname).toMatch(/^\/(es|en)(?:\/.*)?$/)
    expect(registry.get(localeAtom)).toMatch(/^(es|en)$/)

    unmount()
  })))

  it("uses the typed router service from application workflows", () => Effect.runPromise(Effect.gen(function*() {
    const registry = AtomRegistry.make()

    registry.set(openPasswordRecoveryAction, { email: "student@example.com" })
    yield* AtomRegistry.getResult(registry, openPasswordRecoveryAction, { suspendOnWaiting: true })
    expect(location.pathname).toMatch(/^\/(es|en)\/password-recovery$/)

    registry.set(backToLoginAction, undefined)
    yield* AtomRegistry.getResult(registry, backToLoginAction, { suspendOnWaiting: true })
    expect(location.pathname).toMatch(/^\/(es|en)\/login$/)
  })))

  it("restores an unexpired onboarding draft from the web storage adapter", () => {
    const draft: RegistrationDraft = { provider: "email", path: [] }
    expect(registrationDraftStorage.save(draft, 1_000)).toBe(true)
    expect(registrationDraftStorage.load(1_001)).toEqual(draft)
    expect(registrationDraftStorage.clear()).toBe(true)
  })
})
