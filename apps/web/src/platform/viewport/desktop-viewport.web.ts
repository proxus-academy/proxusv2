import { useSyncExternalStore } from "react"

const desktopQuery = "(min-width: 1024px)"

const mediaQuery = () => globalThis.window.matchMedia(desktopQuery)

const subscribe = (notify: () => void) => {
  if (typeof globalThis.window.matchMedia !== "function") return () => undefined
  const query = mediaQuery()
  query.addEventListener("change", notify)
  return () => query.removeEventListener("change", notify)
}

const snapshot = () => typeof globalThis.window.matchMedia !== "function" || mediaQuery().matches

export const useDesktopViewport = () => useSyncExternalStore(subscribe, snapshot, () => true)
