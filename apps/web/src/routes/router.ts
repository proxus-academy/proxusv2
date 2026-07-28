import { makeRetryableCommands } from "@proxus/frontend-core/navigation"
import {
  makeProductRouterService,
  productRoutes,
  type ProductDestination,
  type ProductRouteMatch,
} from "@proxus/frontend-core/public-product"
import {
  browserDeviceLocale,
  clearBrowserLocalePreference,
  makeCanonicalLocaleAtoms,
  makeRouterProductLocaleAtoms,
  persistBrowserLocale,
  preferredBrowserLocale,
} from "../platform/product-locale/index.js"
import { makeWebRegistrationWizardNavigation } from "../platform/registration/index.js"
import {
  browserDocumentNavigationLayer,
  browserRouterLayer,
} from "../platform/routing/index.js"
import { Layer, ManagedRuntime } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"

export const navigation = makeRetryableCommands()
export const Router = makeProductRouterService("@proxus/web/Router")
const fallback = () => productRoutes.destination("registration", {
  path: { locale: preferredBrowserLocale() },
})
const managedRouterRuntime = ManagedRuntime.make(
  browserRouterLayer<ProductDestination, "locale", ProductRouteMatch>(Router, productRoutes, {
    notFound: fallback,
    contextParameters: ["locale"],
  }),
)
export const router = await managedRouterRuntime.runPromise(Router)
export const routerRuntime = Atom.runtime(Layer.merge(
  Layer.succeed(Router, router),
  browserDocumentNavigationLayer(),
))

const registrationDestination = (locale: ProductDestination["params"]["locale"]) =>
  productRoutes.destination("registration", { path: { locale } })
const applyDocumentLocale = (locale: ProductDestination["params"]["locale"]) => {
  document.documentElement.lang = locale
  document.documentElement.dir = "ltr"
}

const canonicalLocale = makeCanonicalLocaleAtoms({
  router,
  routes: productRoutes,
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

export const currentDestinationAtom = router.current
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

export const disposeRouter = () => managedRouterRuntime.dispose()
