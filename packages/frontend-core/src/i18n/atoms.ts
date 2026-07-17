import type { Locale } from "@proxus/product-i18n"
import * as Atom from "effect/unstable/reactivity/Atom"

export type LocaleAtom = Atom.Writable<Locale, Locale>

export const makeI18nAtoms = (localeAtom: LocaleAtom) => ({ localeAtom }) as const

export type I18nAtoms = ReturnType<typeof makeI18nAtoms>
