import { auth_session_active } from "../../paraglide/messages.js"
import { createFileRoute } from "@tanstack/react-router"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { currentSessionQuery, logoutAction } from "@proxus/frontend-core/auth"
import { Box, Center, Heading, Stack, Text } from "@proxus/ui"
import { LogoutButton } from "../../modules/auth/auth-controls.js"

export const Route = createFileRoute("/_authenticated/app")({
  component: HomePage,
})

export function HomePage() {
  const session = useAtomValue(currentSessionQuery)
  const logout = useAtomSet(logoutAction)
  const result = useAtomValue(logoutAction)
  if (session._tag !== "Success" || session.value === null) return null
  return (
    <Box as="main" minHeight="screen" background="default" paddingX="xl" paddingY="xl">
      <Center as="section" maxWidth="lg">
        <Stack gap="md">
        <Heading level={1}>Hola, {session.value.account.username}</Heading>
        <Text>{auth_session_active()}</Text>
        <LogoutButton
          busy={result.waiting}
          error={result._tag === "Failure"}
          onLogout={() => logout()}
        />
        </Stack>
      </Center>
    </Box>
  )
}
