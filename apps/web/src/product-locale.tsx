import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { composition } from "./composition.js"
import { isLocale, type MessagesCatalog } from "@proxus/product-messages"

export const { localeAtom, messagesCatalogAtom, selectLocaleAtom, useDeviceLocaleAtom } = composition.locale

export function useMessagesCatalog(): MessagesCatalog {
  return useAtomValue(messagesCatalogAtom)
}

export function LanguageSelector() {
  const locale = useAtomValue(localeAtom)
  const selectLocale = useAtomSet(selectLocaleAtom)
  const useDeviceLocale = useAtomSet(useDeviceLocaleAtom)
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
      <button type="button" className="underline" onClick={() => useDeviceLocale()}>
        {m.language.device}
      </button>
    </div>
  )
}
