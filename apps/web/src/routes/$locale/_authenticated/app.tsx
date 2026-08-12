import { createFileRoute } from "@tanstack/react-router"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { currentSessionQuery, logoutAction } from "@proxus/frontend-core/auth"
import { Heading, Text } from "@proxus/ui"
import { LogoutButton } from "../../../modules/auth/auth-controls.js"
import { useTranslation } from "../../../platform/product-locale/paraglide-react.js"

export const Route = createFileRoute("/$locale/_authenticated/app")({
  component: HomePage,
})

export function HomePage() {
  const session = useAtomValue(currentSessionQuery)
  const logout = useAtomSet(logoutAction)
  const result = useAtomValue(logoutAction)
  const { t } = useTranslation("auth", { keyPrefix: "session" })
  if (session._tag !== "Success" || session.value === null) return null
  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground">
      <section className="mx-auto max-w-lg">
        <Heading level={1}>Hola, {session.value.account.username}</Heading>
        <Text>{t("active")}</Text>
        <LogoutButton
          busy={result.waiting}
          error={result._tag === "Failure"}
          onLogout={() => logout()}
        />
      </section>
    </main>
  )
}
