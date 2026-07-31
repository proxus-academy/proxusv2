import { Effect } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { makeRetryableCommands } from "../navigation/index.js"
import { makeProductLocaleAtoms } from "./atoms.js"

describe("product locale atoms", () => {
  it("replaces the active locale through the navigation port", () => {
    const source = Atom.make<"es" | "en">("es")
    const localeAtom = Atom.writable(
      (get) => get(source),
      (get, locale: "es" | "en") => get.set(source, locale),
    )
    const { selectLocaleAtom } = makeProductLocaleAtoms({
      localeAtom,
      replaceLocale: (locale, get) => Effect.sync(() => get.set(localeAtom, locale)),
    }, makeRetryableCommands())
    const registry = AtomRegistry.make()

    expect(registry.get(localeAtom)).toBe("es")
    registry.set(selectLocaleAtom, "en")
    expect(AsyncResult.getOrThrow(registry.get(selectLocaleAtom))).toBeUndefined()
    expect(registry.get(localeAtom)).toBe("en")
  })
})
