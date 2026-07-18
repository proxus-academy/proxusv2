import { catalogFor, type Locale } from "@proxus/product-messages"
import * as Atom from "effect/unstable/reactivity/Atom"

export type LocaleAtom = Atom.Writable<Locale, Locale>

export const makeProductLocaleAtoms = (localeAtom: LocaleAtom) => {
  const messagesCatalogAtom = Atom.make((get) => catalogFor(get(localeAtom)))

  return { localeAtom, messagesCatalogAtom } as const
}

export type ProductLocaleAtoms = ReturnType<typeof makeProductLocaleAtoms>
