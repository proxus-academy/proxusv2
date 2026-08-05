import { useSyncExternalStore } from "react"

const narrowViewportQuery = "(max-width: 1023px)"
const coarsePointerQuery = "(any-pointer: coarse)"

const mediaQueries = () => [
  globalThis.window.matchMedia(narrowViewportQuery),
  globalThis.window.matchMedia(coarsePointerQuery),
] as const

const subscribe = (notify: () => void) => {
  if (typeof globalThis.window.matchMedia !== "function") return () => undefined
  const queries = mediaQueries()
  for (const query of queries) query.addEventListener("change", notify)
  return () => {
    for (const query of queries) query.removeEventListener("change", notify)
  }
}

const snapshot = () => {
  if (typeof globalThis.window.matchMedia !== "function") return true
  const [narrow, coarsePointer] = mediaQueries()
  return !narrow.matches || !coarsePointer.matches
}

export const useDesktopViewport = () => useSyncExternalStore(subscribe, snapshot, () => true)
