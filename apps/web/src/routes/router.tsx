import { createRouter, RouterProvider as TanStackRouterProvider, type RouterHistory } from "@tanstack/react-router"
import { I18nextProvider } from "react-i18next"
import { preferredBrowserLocale, productI18nFor } from "../platform/product-locale/index.js"
import { routeTree } from "../routeTree.gen.js"

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
