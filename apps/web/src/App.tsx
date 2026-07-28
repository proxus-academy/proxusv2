import { useAtomValue } from "@effect/atom-react"
import { localeLifecycleAtom } from "./routes/router.js"
import { AppRoutes } from "./routes/app-routes.js"

export function App() {
  useAtomValue(localeLifecycleAtom)
  return <AppRoutes />
}
