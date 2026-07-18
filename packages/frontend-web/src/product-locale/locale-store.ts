import type { LocaleAtom } from "@proxus/frontend-core/product-locale"
import { isLocale, type Locale } from "@proxus/product-messages"
import * as Atom from "effect/unstable/reactivity/Atom"

const STORAGE_KEY = "proxus.product-locale.v1"
const parseLocale = (value: unknown): Locale | undefined => isLocale(value) ? value : undefined

export interface LocaleStore {
  readonly getSnapshot: () => Locale
  readonly subscribe: (listener: () => void) => () => void
  readonly select: (locale: Locale) => void
  readonly useDevice: () => void
  readonly dispose: () => void
}

function storage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function storedLocale(): Locale | undefined {
  try {
    const value: unknown = JSON.parse(storage()?.getItem(STORAGE_KEY) ?? "null")
    if (typeof value === "object" && value !== null && "locale" in value) {
      return isLocale(value.locale) ? value.locale : undefined
    }
  } catch {
    // Storage is optional and may be unavailable or contain stale data.
  }
  return undefined
}

function browserLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    if (isLocale(language)) return language
    const normalized = language.toLowerCase()
    if (normalized.startsWith("es-")) return "es"
    if (normalized.startsWith("en-")) return "en"
  }
  return "es"
}

export function makeBrowserLocaleStore(): LocaleStore {
  const listeners = new Set<() => void>()
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      getSnapshot: () => "es",
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      select: () => undefined,
      useDevice: () => undefined,
      dispose: () => listeners.clear(),
    }
  }
  const url = new URL(window.location.href)
  const urlLocale = url.searchParams.getAll("lang").length === 1
    ? parseLocale(url.searchParams.get("lang"))
    : undefined
  let current = urlLocale ?? storedLocale() ?? browserLocale(navigator.languages)

  const applyDocumentLocale = () => {
    document.documentElement.lang = current
    document.documentElement.dir = "ltr"
  }
  const notify = () => listeners.forEach((listener) => listener())
  const replaceUrlLocale = (locale: Locale | undefined) => {
    const next = new URL(window.location.href)
    if (locale === undefined) next.searchParams.delete("lang")
    else next.searchParams.set("lang", locale)
    window.history.replaceState(window.history.state, "", next)
  }
  if (url.searchParams.has("lang") && urlLocale === undefined) replaceUrlLocale(undefined)

  const update = (locale: Locale) => {
    if (locale === current) return
    current = locale
    applyDocumentLocale()
    notify()
  }
  const onPopState = () => {
    const nextUrl = new URL(window.location.href)
    const values = nextUrl.searchParams.getAll("lang")
    const fromUrl = values.length === 1 ? parseLocale(values[0]) : undefined
    update(fromUrl ?? storedLocale() ?? browserLocale(navigator.languages))
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return
    const activeUrl = new URL(window.location.href)
    if (activeUrl.searchParams.getAll("lang").length === 1 && parseLocale(activeUrl.searchParams.get("lang")) !== undefined) return
    update(storedLocale() ?? browserLocale(navigator.languages))
  }

  applyDocumentLocale()
  window.addEventListener("popstate", onPopState)
  window.addEventListener("storage", onStorage)

  return {
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    select: (locale) => {
      try {
        storage()?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, locale }))
      } catch {
        // The URL remains the durable source for this tab.
      }
      replaceUrlLocale(locale)
      update(locale)
    },
    useDevice: () => {
      try {
        storage()?.removeItem(STORAGE_KEY)
      } catch {
        // Storage is best-effort.
      }
      replaceUrlLocale(undefined)
      update(browserLocale(navigator.languages))
    },
    dispose: () => {
      window.removeEventListener("popstate", onPopState)
      window.removeEventListener("storage", onStorage)
      listeners.clear()
    },
  }
}

export const makeWebLocaleAtoms = (store: LocaleStore) => {
  const localeAtom: LocaleAtom = Atom.writable<Locale, Locale>(
    (get) => {
      const unsubscribe = store.subscribe(() => get.setSelf(store.getSnapshot()))
      get.addFinalizer(unsubscribe)
      return store.getSnapshot()
    },
    (get, locale) => {
      store.select(locale)
      get.setSelf(locale)
    },
  )
  const useDeviceLocaleAtom = Atom.fnSync((_input: void, get) => {
    store.useDevice()
    get.set(localeAtom, store.getSnapshot())
  })

  return { localeAtom, useDeviceLocaleAtom } as const
}
