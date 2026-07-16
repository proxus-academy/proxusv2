import { makeBrowserLocaleStore, useLocale } from "@proxus/frontend-web/i18n"
import * as m from "@proxus/product-i18n/messages"
import type { Locale } from "@proxus/product-i18n/runtime"

export const localeStore = makeBrowserLocaleStore()
export const useProductLocale = () => useLocale(localeStore)

export function LanguageSelector({ locale }: { readonly locale: Locale }) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>{m.language_label({}, { locale })}</span>
      <select
        className="rounded-lg border border-border bg-card px-2 py-1 text-foreground"
        value={locale}
        onChange={(event) => localeStore.select(event.target.value as Locale)}
      >
        <option value="es">{m.language_spanish({}, { locale })}</option>
        <option value="en">{m.language_english({}, { locale })}</option>
      </select>
    </label>
  )
}
