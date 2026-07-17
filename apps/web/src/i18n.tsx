import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { makeI18nAtoms } from "@proxus/frontend-core/i18n"
import { makeBrowserLocaleStore, makeWebLocaleAtom } from "@proxus/frontend-web/i18n"
import { catalogFor, isLocale, type MessagesCatalog } from "@proxus/product-i18n"

const localeStore = makeBrowserLocaleStore()
export const { localeAtom } = makeI18nAtoms(makeWebLocaleAtom(localeStore))

export function useMessagesCatalog(): MessagesCatalog {
  const locale = useAtomValue(localeAtom)
  return catalogFor(locale)
}

export function LanguageSelector() {
  const locale = useAtomValue(localeAtom)
  const selectLocale = useAtomSet(localeAtom)
  const m = useMessagesCatalog()

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <select
        aria-label={m.language.label}
        className="rounded-lg border border-border bg-card px-2 py-1 text-foreground"
        value={locale}
        onChange={(event) => {
          if (isLocale(event.target.value)) selectLocale(event.target.value)
        }}
      >
        <option value="es">{m.language.spanish}</option>
        <option value="en">{m.language.english}</option>
      </select>
      <button type="button" className="underline" onClick={localeStore.useDevice}>
        {m.language.device}
      </button>
    </div>
  )
}
