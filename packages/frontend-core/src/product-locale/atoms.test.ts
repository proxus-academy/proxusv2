import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { makeProductLocaleAtoms } from "./atoms.js"

describe("product locale atoms", () => {
  it("derives the typed messages catalog from the active locale", () => {
    const source = Atom.make<"es" | "en">("es")
    const localeAtom = Atom.writable(
      (get) => get(source),
      (get, locale: "es" | "en") => get.set(source, locale),
    )
    const { messagesCatalogAtom } = makeProductLocaleAtoms(localeAtom)
    const registry = AtomRegistry.make()

    expect(registry.get(messagesCatalogAtom).common.back).toBe("Atrás")
    registry.set(localeAtom, "en")
    expect(registry.get(messagesCatalogAtom).common.back).toBe("Back")
  })
})
