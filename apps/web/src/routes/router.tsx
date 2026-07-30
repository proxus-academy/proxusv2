import {
  createRouter,
  index,
  layout,
  route,
} from "@proxus/effect-router"
import { createReactRouter, Outlet as RouterOutlet } from "@proxus/effect-router/react"
import { catalogFor, Locale } from "@proxus/product-messages"
import { Heading } from "@proxus/ui"
import { LoginPage } from "../pages/auth/login-page.js"
import { NewPasswordPage } from "../pages/auth/new-password-page.js"
import { PasswordRecoveryPage } from "../pages/auth/password-recovery-page.js"
import { PasswordUpdatedPage } from "../pages/auth/password-updated-page.js"
import { RecoveryCodePage } from "../pages/auth/recovery-code-page.js"
import { HomePage } from "../pages/home-page.js"
import { RegistrationPage } from "../pages/registration/registration-page.js"
import { FormMessagesProvider } from "../platform/form/index.js"
import { preferredBrowserLocale } from "../platform/product-locale/index.js"
import { browserHistory } from "../platform/routing/browser-history.web.js"
import {
  AuthenticatedLayout,
  PublicOnlyLayout,
} from "../modules/auth/layouts.js"

const initialLocation = browserHistory.location()

export const router = createRouter([
  route({
    path: ":locale",
    params: {
      locale: Locale,
    },
    Component: ({ params }) => {
      document.documentElement.lang = params.locale
      document.documentElement.dir = "ltr"
      return (
        <FormMessagesProvider value={catalogFor(params.locale)}>
          <RouterOutlet />
        </FormMessagesProvider>
      )
    },
    children: [
      layout({
        Layout: PublicOnlyLayout,
        children: [
          index({
            id: "registration",
            Component: RegistrationPage,
          }),
          route({
            id: "login",
            path: "login",
            params: {},
            Component: LoginPage,
          }),
          route({
            path: "password-recovery",
            params: {},
            Component: RouterOutlet,
            children: [
              index({
                id: "password-recovery",
                Component: PasswordRecoveryPage,
              }),
              route({
                id: "password-recovery-code",
                path: "code",
                params: {},
                Component: RecoveryCodePage,
              }),
              route({
                id: "new-password",
                path: "new-password",
                params: {},
                Component: NewPasswordPage,
              }),
              route({
                id: "password-updated",
                path: "done",
                params: {},
                Component: PasswordUpdatedPage,
              }),
            ],
          }),
        ],
      }),
      layout({
        Layout: AuthenticatedLayout,
        children: [
          route({
            id: "home",
            path: "app",
            params: {},
            Component: HomePage,
          }),
        ],
      }),
    ],
  }),
], {
  NotFound: () => (
    <RootRedirect />
  ),
  InvalidUrl: () => <RootRedirect />,
  Error: () => (
    <main>
      <Heading level={1}>No hemos podido abrir esta página</Heading>
    </main>
  ),
}, {
  initialLocation,
  snapshotKey: "web/router/location",
})

export const {
  Link,
  Navigate,
  Outlet,
  RouterProvider,
} = createReactRouter(router, browserHistory)

function RootRedirect() {
  return (
    <Navigate
      id="registration"
      params={{ locale: preferredBrowserLocale() }}
      search={{}}
      replace
    />
  )
}
