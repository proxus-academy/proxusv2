import { isLocale, type Locale } from "@proxus/product-messages"

const STORAGE_KEY = "proxus.product-locale.v1"

function storage(): Storage | undefined {
  try { return window.localStorage } catch { return undefined }
}

export const browserDeviceLocale = (languages: readonly string[] = navigator.languages): Locale => {
  for (const language of languages) {
    if (isLocale(language)) return language
    const normalized = language.toLowerCase()
    if (normalized.startsWith("es-")) return "es"
    if (normalized.startsWith("en-")) return "en"
  }
  return "es"
}

export const preferredBrowserLocale = (): Locale => {
  try {
    const value: unknown = JSON.parse(storage()?.getItem(STORAGE_KEY) ?? "null")
    if (typeof value === "object" && value !== null && "locale" in value && isLocale(value.locale)) {
      return value.locale
    }
  } catch {
    // Storage is optional.
  }
  return browserDeviceLocale()
}

export const persistBrowserLocale = (locale: Locale): void => {
  try { storage()?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, locale })) } catch { /* best effort */ }
}

export const clearBrowserLocalePreference = (): void => {
  try { storage()?.removeItem(STORAGE_KEY) } catch { /* best effort */ }
}
