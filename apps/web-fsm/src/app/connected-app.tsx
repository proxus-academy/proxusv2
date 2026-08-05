import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { useEffect } from "react"
import type { AppAtoms } from "./runtime.js"
import { parseAppRoute } from "./route.js"
import { AppView } from "../view/app-view.js"

export function ConnectedApp({ atoms }: { readonly atoms: AppAtoms }) {
  const model = useAtomValue(atoms.modelAtom)
  const send = useAtomSet(atoms.sendAtom)

  useEffect(() => {
    send({ _tag: "Started" })
    const onPopState = () => send({ _tag: "RouteChanged", route: parseAppRoute(window.location) })
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [send])

  return <AppView model={model} send={send} />
}
