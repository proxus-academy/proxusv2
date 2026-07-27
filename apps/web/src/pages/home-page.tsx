import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { currentSessionQuery, logoutAction } from "@proxus/frontend-core/auth"
import { Heading, Text } from "@proxus/ui"
import { LogoutButton } from "../modules/auth/auth-controls.js"

export function HomePage() {
  const session = useAtomValue(currentSessionQuery)
  const logout = useAtomSet(logoutAction)
  const result = useAtomValue(logoutAction)
  if (session._tag !== "Success" || session.value === null) return null
  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground">
      <section className="mx-auto max-w-lg">
        <Heading level={1}>Hola, {session.value.account.username}</Heading>
        <Text>Tu sesión está activa.</Text>
        <LogoutButton
          busy={result.waiting}
          error={result._tag === "Failure"}
          onLogout={() => logout()}
        />
      </section>
    </main>
  )
}
