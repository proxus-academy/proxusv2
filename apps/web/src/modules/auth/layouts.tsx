import { useAtomValue } from "@effect/atom-react"
import { currentSessionQuery } from "@proxus/frontend-core/auth"
import { Heading, Text } from "@proxus/ui"
import type { ReactNode } from "react"
import {
  authenticatedRouteLifecycleAtom,
  publicOnlyRouteLifecycleAtom,
} from "./route-guards.js"

export function PublicOnlyLayout({ children }: { readonly children: ReactNode }) {
  useAtomValue(publicOnlyRouteLifecycleAtom)
  const session = useAtomValue(currentSessionQuery)
  if (session._tag === "Success" && session.value !== null) return null
  return session._tag === "Success" ? children : null
}

export function AuthenticatedLayout({ children }: { readonly children: ReactNode }) {
  useAtomValue(authenticatedRouteLifecycleAtom)
  const session = useAtomValue(currentSessionQuery)
  if (session._tag === "Failure") {
    return (
      <main>
        <Heading level={1}>No hemos podido comprobar tu sesión</Heading>
        <Text role="alert">Inténtalo de nuevo.</Text>
      </main>
    )
  }
  if (session._tag !== "Success") {
    return <main aria-busy="true"><Heading level={1}>Comprobando tu sesión…</Heading></main>
  }
  return session.value === null ? null : children
}
