import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  notFound,
  Outlet,
  RouterProvider as TanStackRouterProvider,
  type RouterHistory,
  useRouterState,
} from "@tanstack/react-router"
import { Locale } from "@proxus/product-messages"
import { Heading } from "@proxus/ui"
import { Option, Schema } from "effect"
import { AuthenticatedLayout, PublicOnlyLayout } from "../modules/auth/layouts.js"
import { LoginPage } from "../pages/auth/login-page.js"
import { NewPasswordPage } from "../pages/auth/new-password-page.js"
import { PasswordRecoveryPage } from "../pages/auth/password-recovery-page.js"
import { PasswordUpdatedPage } from "../pages/auth/password-updated-page.js"
import { RecoveryCodePage } from "../pages/auth/recovery-code-page.js"
import { HomePage } from "../pages/home-page.js"
import { RegistrationPage } from "../pages/registration/registration-page.js"
import { preferredBrowserLocale, productI18nFor } from "../platform/product-locale/index.js"
import { useDesktopViewport } from "../platform/viewport/index.js"
import { DownloadAppPage } from "../patterns/download-app-page.js"
import { I18nextProvider, useTranslation } from "react-i18next"

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: RootRedirect,
  errorComponent: RouteError,
  validateSearch: (search): Readonly<Record<string, unknown>> => search,
})

export const localeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$locale",
  params: {
    parse: ({ locale }) => {
      const decoded = Schema.decodeUnknownOption(Locale)(locale)
      if (Option.isNone(decoded)) throw notFound()
      return { locale: decoded.value }
    },
    stringify: ({ locale }) => ({ locale }),
  },
  component: LocaleLayout,
})

const publicRoute = createRoute({
  getParentRoute: () => localeRoute,
  id: "public",
  component: PublicOnlyLayout,
})

export const registrationRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "/",
  component: RegistrationRoutePage,
})

function RegistrationRoutePage() {
  const searchValue = useRouterState({ select: ({ location }) => location.searchStr })
  return <RegistrationPage searchValue={searchValue} />
}

const loginRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "login",
  component: LoginPage,
})

const passwordRecoveryRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "password-recovery",
  component: Outlet,
})

const passwordRecoveryIndexRoute = createRoute({
  getParentRoute: () => passwordRecoveryRoute,
  path: "/",
  component: PasswordRecoveryPage,
})

const passwordRecoveryCodeRoute = createRoute({
  getParentRoute: () => passwordRecoveryRoute,
  path: "code",
  component: RecoveryCodePage,
})

const newPasswordRoute = createRoute({
  getParentRoute: () => passwordRecoveryRoute,
  path: "new-password",
  component: NewPasswordPage,
})

const passwordUpdatedRoute = createRoute({
  getParentRoute: () => passwordRecoveryRoute,
  path: "done",
  component: PasswordUpdatedPage,
})

const authenticatedRoute = createRoute({
  getParentRoute: () => localeRoute,
  id: "authenticated",
  component: AuthenticatedLayout,
})

const homeRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "app",
  component: HomePage,
})

const routeTree = rootRoute.addChildren([
  localeRoute.addChildren([
    publicRoute.addChildren([
      registrationRoute,
      loginRoute,
      passwordRecoveryRoute.addChildren([
        passwordRecoveryIndexRoute,
        passwordRecoveryCodeRoute,
        newPasswordRoute,
        passwordUpdatedRoute,
      ]),
    ]),
    authenticatedRoute.addChildren([homeRoute]),
  ]),
])

export const makeWebRouter = (history?: RouterHistory) => createRouter({
  routeTree,
  defaultPreload: "intent",
  ...(history === undefined ? {} : { history }),
})

export const router = makeWebRouter()

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

export function RouterProvider() {
  return (
    <I18nextProvider i18n={productI18nFor(preferredBrowserLocale())}>
      <TanStackRouterProvider router={router} />
    </I18nextProvider>
  )
}

export { Navigate, Outlet }

function LocaleLayout() {
  const { locale } = localeRoute.useParams()
  const desktop = useDesktopViewport()
  document.documentElement.lang = locale
  document.documentElement.dir = "ltr"
  return (
    <I18nextProvider i18n={productI18nFor(locale)}>
      {desktop ? <Outlet /> : <DownloadAppPage />}
    </I18nextProvider>
  )
}

function RootRedirect() {
  return (
    <Navigate
      to="/$locale"
      params={{ locale: preferredBrowserLocale() }}
      replace
    />
  )
}

function RouteError() {
  const { t } = useTranslation("common")
  return (
    <main>
      <Heading level={1}>{t("routeError")}</Heading>
    </main>
  )
}
