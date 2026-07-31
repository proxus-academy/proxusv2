import { useAtomValue } from "@effect/atom-react"
import { currentSessionQuery } from "@proxus/frontend-core/auth"
import { Heading, Text } from "@proxus/ui"
import { Navigate, Outlet, useParams } from "@tanstack/react-router"

export function PublicOnlyLayout() {
  const session = useAtomValue(currentSessionQuery)
  const { locale } = useParams({ from: "/$locale" })
  if (session._tag === "Success" && session.value !== null) {
    return <Navigate to="/$locale/app" params={{ locale }} search={{}} replace />
  }
  return session._tag === "Success" ? <Outlet /> : null
}

export function AuthenticatedLayout() {
  const session = useAtomValue(currentSessionQuery)
  const { locale } = useParams({ from: "/$locale" })
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
  return session.value === null
    ? <Navigate to="/$locale/login" params={{ locale }} search={{}} replace />
    : <Outlet />
}
