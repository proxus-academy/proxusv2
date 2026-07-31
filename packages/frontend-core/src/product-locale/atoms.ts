import type { Locale } from "@proxus/product-messages"
import type { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { RetryableCommandRunner } from "../navigation/index.js"

export interface ProductLocaleNavigation<E> {
  readonly localeAtom: Atom.Atom<Locale>
  readonly replaceLocale: (
    locale: Locale,
    get: Atom.FnContext,
  ) => Effect.Effect<void, E>
}

export const makeProductLocaleAtoms = <E>(
  navigation: ProductLocaleNavigation<E>,
  runner: RetryableCommandRunner,
) => {
  const selectLocaleAtom = Atom.fn<Locale>()((locale, get) =>
    runner.run(get, navigation.replaceLocale(locale, get)))

  return {
    localeAtom: navigation.localeAtom,
    selectLocaleAtom,
  }
}

export type ProductLocaleAtoms = ReturnType<typeof makeProductLocaleAtoms>
