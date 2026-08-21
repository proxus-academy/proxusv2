import { auth_session_checkFailed, auth_session_checking, common_retry } from "../../paraglide/messages.js"
import { useAtomValue } from "@effect/atom-react"
import { currentSessionQuery } from "@proxus/frontend-core/auth"
import { Box, Heading, Text } from "@proxus/ui"
import { Navigate, Outlet } from "@tanstack/react-router"
import { realtimeLifecycleAtom } from "../realtime.js"

export function PublicOnlyLayout() {
  const session = useAtomValue(currentSessionQuery)
  if (session._tag === "Success" && session.value !== null) {
    return <Navigate to="/app" replace />
  }
  return session._tag === "Success" ? <Outlet /> : null
}

export function AuthenticatedLayout() {
  const session = useAtomValue(currentSessionQuery)
  if (session._tag === "Failure") {
    return (
      <Box as="main">
        <Heading level={1}>{auth_session_checkFailed()}</Heading>
        <Text role="alert">{common_retry()}</Text>
      </Box>
    )
  }
  if (session._tag !== "Success") {
    return <Box as="main" busy><Heading level={1}>{auth_session_checking()}</Heading></Box>
  }
  return session.value === null
    ? <Navigate to="/login" replace />
    : <AuthenticatedRealtimeOutlet />
}

function AuthenticatedRealtimeOutlet() {
  useAtomValue(realtimeLifecycleAtom)
  return <Outlet />
}
