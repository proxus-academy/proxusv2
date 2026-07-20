import { makeFeatureFlagSnapshotModule, makeRegistrationLandingAtoms } from "@proxus/frontend-core/feature-flags"
import { makeRetryableCommands } from "@proxus/frontend-core/navigation"
import { makeRegistrationAtoms } from "@proxus/frontend-core/registration"
import { compile, index, makeRouterService, param, root, type DestinationOf } from "@proxus/frontend-core/routing"
import { FeatureFlagInstallationIdentityWebLive, makeFeatureFlagDistributionWebLive, registrationLandingAnalyticsWebLayer } from "@proxus/frontend-web/feature-flags"
import {
  browserDeviceLocale,
  clearBrowserLocalePreference,
  makeCanonicalLocaleAtoms,
  makeRouterProductLocaleAtoms,
  persistBrowserLocale,
  preferredBrowserLocale,
} from "@proxus/frontend-web/product-locale"
import { makeWebRegistrationPathNavigation } from "@proxus/frontend-web/registration"
import { browserRouterLayer } from "@proxus/frontend-web/routing"
import { Locale, type Locale as LocaleType } from "@proxus/product-messages"
import { Effect, Layer, ManagedRuntime } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

const definition = root({ id: "root", children: [
  param({ id: "locale", name: "locale", schema: Locale, children: [index({ id: "registration" })] }),
] })
const routes = compile(definition)
type AppDestination = DestinationOf<typeof definition>
const AppRouter = makeRouterService<AppDestination>("@proxus/web/AppRouter")

const makeAppComposition = Effect.gen(function*() {
  const navigation = makeRetryableCommands()
  const fallback = () => routes.destination("registration", { locale: preferredBrowserLocale() })
  const runtime = ManagedRuntime.make(browserRouterLayer(AppRouter, routes, { notFound: fallback }))
  const router = yield* Effect.promise(() => runtime.runPromise(AppRouter))
  const destination = (locale: LocaleType) => routes.destination("registration", { locale })
  const applyDocumentLocale = (locale: LocaleType) => {
    document.documentElement.lang = locale
    document.documentElement.dir = "ltr"
  }
  const canonicalLocale = makeCanonicalLocaleAtoms({
    router,
    routes,
    destination,
    preferredLocale: preferredBrowserLocale,
    applyDocumentLocale,
    runner: navigation,
  })
  const locale = makeRouterProductLocaleAtoms({
    router,
    destination,
    deviceLocale: browserDeviceLocale,
    persistLocale: persistBrowserLocale,
    clearLocalePreference: clearBrowserLocalePreference,
    applyDocumentLocale,
    runner: navigation,
  })
  const featureFlags = makeFeatureFlagDistributionWebLive("/api").pipe(
    Atom.runtime,
    makeFeatureFlagSnapshotModule,
  )
  const registrationLanding = makeRegistrationLandingAtoms({
    snapshotAtom: featureFlags.snapshotAtom,
    layer: Layer.merge(
      FeatureFlagInstallationIdentityWebLive,
      registrationLandingAnalyticsWebLayer("/api"),
    ),
  })
  const registrationPathNavigation = makeWebRegistrationPathNavigation(router, navigation)
  const registrationPath = makeRegistrationAtoms(
    registrationPathNavigation,
    navigation,
    {
      registrationStarted: (get) => get.setResult(registrationLanding.registrationStartedAtom, undefined),
      registrationCompleted: (get) => get.setResult(registrationLanding.registrationCompletedAtom, undefined),
    },
  )
  const registration = {
    ...registrationPath,
    ...registrationLanding,
    canonicalizeRegistrationPathAtom: registrationPathNavigation.canonicalizeRegistrationPathAtom,
    registrationPathLifecycleAtom: registrationPathNavigation.registrationPathLifecycleAtom,
  }
  return {
    router,
    navigation,
    locale: { ...locale, ...canonicalLocale },
    featureFlags,
    registration,
    dispose: () => runtime.dispose(),
  }
})

export const composition = await Effect.runPromise(makeAppComposition)
