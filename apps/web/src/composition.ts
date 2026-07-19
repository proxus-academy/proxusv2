import { makeFeatureFlagRealtimeAtoms, makeRegistrationLandingAtoms } from "@proxus/frontend-core/feature-flags"
import { makeProductLocaleAtoms, type LocaleAtom } from "@proxus/frontend-core/product-locale"
import { makeRegistrationAtoms } from "@proxus/frontend-core/registration"
import { compile, index, makeRouterService, param, root, type DestinationOf } from "@proxus/frontend-core/routing"
import { FeatureFlagInstallationIdentityWebLive, featureFlagRealtimeWebLayer, registrationLandingAnalyticsWebLayer } from "@proxus/frontend-web/feature-flags"
import { clearBrowserLocalePreference, persistBrowserLocale, preferredBrowserLocale } from "@proxus/frontend-web/product-locale"
import { makeWebRegistrationPathAtom } from "@proxus/frontend-web/registration"
import { browserRouterLayer } from "@proxus/frontend-web/routing"
import { Locale, type Locale as LocaleType } from "@proxus/product-messages"
import { Effect, Layer, ManagedRuntime } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

const definition = root({ id: "root", children: [
  param({ id: "locale", name: "locale", schema: Locale, children: [index({ id: "registration" })] }),
] })
export const routes = compile(definition)
type AppDestination = DestinationOf<typeof definition>
export const AppRouter = makeRouterService<AppDestination>("@proxus/web/AppRouter")

export const makeAppComposition = Effect.gen(function*() {
  const fallback = () => routes.destination("registration", { locale: preferredBrowserLocale() })
  const runtime = ManagedRuntime.make(browserRouterLayer(AppRouter, routes, { notFound: fallback }))
  const router = yield* Effect.promise(() => runtime.runPromise(AppRouter))
  const initialLocation = new URL(window.location.href)
  const search = new URLSearchParams(initialLocation.search)
  const hadLegacyLocale = search.has("lang")
  search.delete("lang")
  const canonicalMatch = /^\/(es|en)$/.exec(initialLocation.pathname)
  const current = canonicalMatch?.[1] as LocaleType | undefined
  if (current === undefined || hadLegacyLocale) {
    const destination = current === undefined ? fallback() : routes.destination("registration", { locale: current })
    yield* router.replace(destination, { search: search.toString() })
  }

  const applyDocumentLocale = (locale: LocaleType) => {
    document.documentElement.lang = locale
    document.documentElement.dir = "ltr"
  }
  const localeAtom: LocaleAtom = Atom.writable(
    (get) => {
      const locale = get(router.current).params.locale as LocaleType
      applyDocumentLocale(locale)
      return locale
    },
    (get, locale) => {
      persistBrowserLocale(locale)
      applyDocumentLocale(locale)
      const location = get.get(router.location)
      runtime.runFork(router.replace(routes.destination("registration", { locale }), { search: location.search }))
    },
    (refresh) => refresh(router.current),
  )
  const locale = makeProductLocaleAtoms(localeAtom)
  const useDeviceLocaleAtom = Atom.fnSync((_input: void, get) => {
    clearBrowserLocalePreference()
    get.set(locale.selectLocaleAtom, preferredBrowserLocale())
  })
  const registrationPath = makeRegistrationAtoms(makeWebRegistrationPathAtom(router))
  const featureFlags = makeFeatureFlagRealtimeAtoms(featureFlagRealtimeWebLayer())
  const registrationLanding = makeRegistrationLandingAtoms({
    snapshotAtom: featureFlags.snapshotAtom,
    layer: Layer.merge(FeatureFlagInstallationIdentityWebLive, registrationLandingAnalyticsWebLayer()),
  })
  const registration = { ...registrationPath, ...registrationLanding }
  return { router, locale: { ...locale, useDeviceLocaleAtom }, registration, featureFlags, dispose: () => runtime.dispose() }
})

export const composition = await Effect.runPromise(makeAppComposition)
