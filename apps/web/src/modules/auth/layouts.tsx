import { useAtomValue } from "@effect/atom-react"
import { currentSessionQuery } from "@proxus/frontend-core/auth"
import { Heading, Text } from "@proxus/ui"
import { currentLocale } from "../../routes/navigation.js"
import { Navigate, Outlet } from "../../routes/router.js"

export function PublicOnlyLayout() {
  const session = useAtomValue(currentSessionQuery)
  if (session._tag === "Success" && session.value !== null) {
    return <Navigate id="home" params={{ locale: currentLocale() }} search={{}} replace />
  }
  return session._tag === "Success" ? <Outlet /> : null
}

export function AuthenticatedLayout() {
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
  return session.value === null
    ? <Navigate id="login" params={{ locale: currentLocale() }} search={{}} replace />
    : <Outlet />
}
