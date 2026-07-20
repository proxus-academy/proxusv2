import { Effect } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { makeRetryableCommands } from "../navigation/index.js"
import { makeProductLocaleAtoms } from "./atoms.js"

describe("product locale atoms", () => {
  it("derives the typed messages catalog from the active locale", () => {
    const source = Atom.make<"es" | "en">("es")
    const localeAtom = Atom.writable(
      (get) => get(source),
      (get, locale: "es" | "en") => get.set(source, locale),
    )
    const { messagesCatalogAtom, selectLocaleAtom } = makeProductLocaleAtoms({
      localeAtom,
      replaceLocale: (locale, get) => Effect.sync(() => get.set(localeAtom, locale)),
    }, makeRetryableCommands())
    const registry = AtomRegistry.make()

    expect(registry.get(messagesCatalogAtom).common.back).toBe("Atrás")
    registry.set(selectLocaleAtom, "en")
    expect(AsyncResult.getOrThrow(registry.get(selectLocaleAtom))).toBeUndefined()
    expect(registry.get(messagesCatalogAtom).common.back).toBe("Back")
  })
})
