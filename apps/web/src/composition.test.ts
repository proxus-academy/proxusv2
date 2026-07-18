// @vitest-environment happy-dom
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { composition } from "./composition.js"

describe("web composition root", () => {
  it("canonicalizes startup to a locale-prefixed route and shares query through router projections", () => {
    expect(location.pathname).toMatch(/^\/(es|en)$/)
    const registry = AtomRegistry.make()
    expect(registry.get(composition.locale.localeAtom)).toMatch(/^(es|en)$/)
    expect(registry.get(composition.registration.registrationPathAtom)).toEqual([])
  })
})
