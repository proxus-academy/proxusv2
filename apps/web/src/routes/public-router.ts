import { currentSessionQuery } from "@proxus/frontend-core/auth"
import { makeRetryableCommands } from "@proxus/frontend-core/navigation"
import {
  makePublicProductRouterService,
  publicProductRoutes,
  type PublicProductDestination,
} from "@proxus/frontend-core/public-product"
import {
  browserDeviceLocale,
  clearBrowserLocalePreference,
  makeCanonicalLocaleAtoms,
  makeRouterProductLocaleAtoms,
  persistBrowserLocale,
  preferredBrowserLocale,
} from "@proxus/frontend-web/product-locale"
import { makeWebRegistrationWizardNavigation } from "@proxus/frontend-web/registration"
import {
  browserDocumentNavigationLayer,
  browserRouterLayer,
} from "@proxus/frontend-web/routing"
import { Effect, Layer, ManagedRuntime } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

const navigation = makeRetryableCommands()
export const PublicRouter = makePublicProductRouterService("@proxus/web/PublicRouter")
const fallback = () => publicProductRoutes.destination("registration", {
  path: { locale: preferredBrowserLocale() },
})
const routerRuntime = ManagedRuntime.make(
  browserRouterLayer<PublicProductDestination, "locale">(PublicRouter, publicProductRoutes, {
    notFound: fallback,
    contextParameters: ["locale"],
  }),
)
const router = await routerRuntime.runPromise(PublicRouter)
export const publicRouterRuntime = Atom.runtime(Layer.merge(
  Layer.succeed(PublicRouter, router),
  browserDocumentNavigationLayer(),
))

const registrationDestination = (locale: PublicProductDestination["params"]["locale"]) =>
  publicProductRoutes.destination("registration", { path: { locale } })
const applyDocumentLocale = (locale: PublicProductDestination["params"]["locale"]) => {
  document.documentElement.lang = locale
  document.documentElement.dir = "ltr"
}

const canonicalLocale = makeCanonicalLocaleAtoms({
  router,
  routes: publicProductRoutes,
  destination: registrationDestination,
  preferredLocale: preferredBrowserLocale,
  applyDocumentLocale,
  runner: navigation,
})
const productLocale = makeRouterProductLocaleAtoms({
  router,
  destination: registrationDestination,
  deviceLocale: browserDeviceLocale,
  persistLocale: persistBrowserLocale,
  clearLocalePreference: clearBrowserLocalePreference,
  applyDocumentLocale,
  runner: navigation,
})
const registrationWizard = makeWebRegistrationWizardNavigation(router, navigation)

export const currentRouteAtom = Atom.map(router.current, ({ id }) => id)
export const routeLocationAtom = router.location
export const routeErrorAtom = router.error
export const localeAtom = productLocale.localeAtom
export const messagesCatalogAtom = productLocale.messagesCatalogAtom
export const selectLocaleAction = productLocale.selectLocaleAtom
export const useDeviceLocaleAction = productLocale.useDeviceLocaleAtom
export const canonicalizeLocaleAction = canonicalLocale.canonicalizeLocaleAtom
export const localeLifecycleAtom = canonicalLocale.localeLifecycleAtom
export const navigationFailedAtom = navigation.failedAtom
export const retryNavigationAction = navigation.retryAtom
export const registrationUrlStateAtom = registrationWizard.urlStateAtom
export const pushRegistrationStep = registrationWizard.push

export const authenticatedLayoutLifecycleAtom = Atom.make((get) => {
  const session = get(currentSessionQuery)
  return session._tag === "Success" && session.value === null
    ? navigation.run(get, router.replace("login"))
    : Effect.void
})

export const publicLayoutLifecycleAtom = Atom.make((get) => {
  const session = get(currentSessionQuery)
  return session._tag === "Success" && session.value !== null
    ? navigation.run(get, router.replace("home"))
    : Effect.void
})

export const disposePublicRouter = () => routerRuntime.dispose()
