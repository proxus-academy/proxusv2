import { useAtomValue } from "@effect/atom-react"
import { localeLifecycleAtom } from "./routes/public-router.js"
import { PublicRouterPage } from "./routes/public-router-page.js"

export function App() {
  useAtomValue(localeLifecycleAtom)
  return <PublicRouterPage />
}
