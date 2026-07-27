import { makeFeatureFlagSnapshotModule, makeRegistrationLandingAtoms } from "@proxus/frontend-core/feature-flags"
import { makeRetryableCommands } from "@proxus/frontend-core/navigation"
import {
  makePublicProductRouterService,
  publicProductRoutes,
  type PublicProductDestination,
} from "@proxus/frontend-core/public-product"
import { makeRegistrationAtoms } from "@proxus/frontend-core/registration"
import {
  FeatureFlagInstallationIdentityWebLive,
  makeFeatureFlagDistributionWebLive,
  registrationLandingAnalyticsWebLayer,
} from "../feature-flags/index.js"
import {
  browserDeviceLocale,
  clearBrowserLocalePreference,
  makeCanonicalLocaleAtoms,
  makeRouterProductLocaleAtoms,
  persistBrowserLocale,
  preferredBrowserLocale,
} from "../product-locale/index.js"
import { makeWebRegistrationPathNavigation } from "../registration/index.js"
import { browserRouterLayer } from "../routing/index.js"
import type { Locale } from "@proxus/product-messages"
import { Effect, Layer, ManagedRuntime } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

export interface PublicWebProductCompositionOptions {
  /** A globally unique Effect service identifier owned by the application. */
  readonly routerIdentifier: string
}

/**
 * Composes the public product with browser adapters.
 *
 * Product rules remain in frontend-core; this adapter selects browser History,
 * storage, document locale and same-origin HTTP for web and mobile-web.
 */
export const makePublicWebProductComposition = Effect.fn(
  "PublicWebProductComposition.make",
)(function*({
  routerIdentifier,
}: PublicWebProductCompositionOptions) {
  const navigation = makeRetryableCommands()
  const AppRouter = makePublicProductRouterService(routerIdentifier)
  const fallback = () => publicProductRoutes.destination("registration", {
    path: { locale: preferredBrowserLocale() },
  })
  const runtime = ManagedRuntime.make(
    browserRouterLayer<PublicProductDestination, "locale">(AppRouter, publicProductRoutes, {
      notFound: fallback,
      contextParameters: ["locale"],
    }),
  )
  const router = yield* Effect.promise(() => runtime.runPromise(AppRouter))
  const destination = (locale: Locale) =>
    publicProductRoutes.destination("registration", { path: { locale } })
  const applyDocumentLocale = (locale: Locale) => {
    document.documentElement.lang = locale
    document.documentElement.dir = "ltr"
  }
  const canonicalLocale = makeCanonicalLocaleAtoms({
    router,
    routes: publicProductRoutes,
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
  const registrationPathNavigation = makeWebRegistrationPathNavigation(
    router,
    navigation,
  )
  const registrationPath = makeRegistrationAtoms(
    registrationPathNavigation,
    navigation,
    {
      registrationStarted: (get) =>
        get.setResult(registrationLanding.registrationStartedAtom, undefined),
      registrationCompleted: (get) =>
        get.setResult(registrationLanding.registrationCompletedAtom, undefined),
    },
  )
  const registration = {
    ...registrationPath,
    ...registrationLanding,
    canonicalizeRegistrationPathAtom:
      registrationPathNavigation.canonicalizeRegistrationPathAtom,
    registrationPathLifecycleAtom:
      registrationPathNavigation.registrationPathLifecycleAtom,
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

