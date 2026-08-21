import { createRouter, RouterProvider as TanStackRouterProvider, type RouterHistory } from "@tanstack/react-router"
import { deLocalizeUrl, localizeUrl } from "../paraglide/runtime.js"
import { routeTree } from "../routeTree.gen.js"

export const makeWebRouter = (history?: RouterHistory, basepath = import.meta.env.VITE_WEB_BASE_PATH) => createRouter({
  routeTree,
  defaultPreload: "intent",
  ...(basepath === undefined || basepath === "" ? {} : { basepath }),
  rewrite: {
    input: ({ url }) => deLocalizeUrl(url),
    output: ({ url }) => localizeUrl(url),
  },
  ...(history === undefined ? {} : { history }),
})

export const router = makeWebRouter()

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

export function RouterProvider() {
  return <TanStackRouterProvider router={router} />
}
