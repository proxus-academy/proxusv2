// @vitest-environment happy-dom
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import { Effect } from "effect"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { composition } from "./composition.js"

describe("web composition root", () => {
  it("keeps composition alive while scoped atoms canonicalize startup and share router projections", () => Effect.runPromise(Effect.gen(function*() {
    const registry = AtomRegistry.make()
    const unmountLocale = registry.mount(composition.locale.localeLifecycleAtom)
    const unmountPath = registry.mount(composition.registration.registrationPathLifecycleAtom)

    yield* AtomRegistry.getResult(
      registry,
      composition.locale.canonicalizeLocaleAtom,
      { suspendOnWaiting: true },
    )
    expect(location.pathname).toMatch(/^\/(es|en)$/)
    expect(registry.get(composition.locale.localeAtom)).toMatch(/^(es|en)$/)
    expect(registry.get(composition.registration.registrationPathAtom)).toEqual([])

    unmountPath()
    unmountLocale()
  })))

  it("routes auth pages as typed destinations and keeps onboarding state in its query", () => Effect.runPromise(Effect.gen(function*() {
    const registry = AtomRegistry.make()
    registry.set(composition.auth.authEventAtom, { _tag: "RecoveryRequested", email: "student@example.com" })
    yield* AtomRegistry.getResult(registry, composition.auth.authEventAtom, { suspendOnWaiting: true })
    expect(location.pathname).toMatch(/^\/(es|en)\/password-recovery$/)

    registry.set(composition.auth.authEventAtom, { _tag: "BackToLoginRequested" })
    yield* AtomRegistry.getResult(registry, composition.auth.authEventAtom, { suspendOnWaiting: true })
    expect(location.pathname).toMatch(/^\/(es|en)\/login$/)

    registry.set(composition.auth.authEventAtom, { _tag: "RegistrationRequested" })
    yield* AtomRegistry.getResult(registry, composition.auth.authEventAtom, { suspendOnWaiting: true })
    registry.set(composition.registrationWizard.pushAtom, { step: "problem", path: [] })
    yield* AtomRegistry.getResult(registry, composition.registrationWizard.pushAtom, { suspendOnWaiting: true })
    expect(new URLSearchParams(location.search).get("step")).toBe("problem")

    registry.set(composition.registrationWizard.pushAtom, { step: "start", path: [] })
    yield* AtomRegistry.getResult(registry, composition.registrationWizard.pushAtom, { suspendOnWaiting: true })
    expect(new URLSearchParams(location.search).has("step")).toBe(false)
  })))

  it("restores an unexpired onboarding draft from the composed web storage adapter", () => {
    const draft: RegistrationDraft = { provider: "email", path: [] }
    expect(composition.draftStorage.save(draft, 1_000)).toBe(true)
    expect(composition.draftStorage.load(1_001)).toEqual(draft)
    expect(composition.draftStorage.clear()).toBe(true)
  })
})
