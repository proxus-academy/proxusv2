import type {
  RouterHistory,
  RouterLocation,
} from "@proxus/effect-router"

const currentLocation = (): RouterLocation => ({
  pathname: globalThis.location?.pathname ?? "/",
  search: globalThis.location?.search ?? "",
  hash: globalThis.location?.hash ?? "",
})

export const browserHistory: RouterHistory = {
  location: currentLocation,
  push: (location) => {
    globalThis.history.pushState(
      null,
      "",
      `${location.pathname}${location.search}${location.hash}`,
    )
  },
  replace: (location) => {
    globalThis.history.replaceState(
      null,
      "",
      `${location.pathname}${location.search}${location.hash}`,
    )
  },
  back: () => globalThis.history.back(),
  forward: () => globalThis.history.forward(),
  listen: (listener) => {
    const onPopState = () => listener(currentLocation())
    globalThis.addEventListener("popstate", onPopState)
    return () => globalThis.removeEventListener("popstate", onPopState)
  },
}
