// @vitest-environment happy-dom
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
})
