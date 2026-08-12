import { createRouter, RouterProvider as TanStackRouterProvider, type RouterHistory } from "@tanstack/react-router"
import { routeTree } from "../routeTree.gen.js"

export const makeAdminRouter = (history?: RouterHistory) => createRouter({
  routeTree,
  defaultPreload: "intent",
  ...(history === undefined ? {} : { history }),
})

export const router = makeAdminRouter()

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}

export function RouterProvider() {
  return <TanStackRouterProvider router={router} />
}
