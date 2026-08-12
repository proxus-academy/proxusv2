import { createFileRoute } from "@tanstack/react-router"
import { useAtomSet } from "@effect/atom-react"
import { Exit } from "effect"
import { Text } from "@proxus/ui"
import { BackToLoginButton } from "../../../../modules/auth/auth-controls.js"
import { backToLoginAction } from "../../../../modules/auth/actions.js"
import { AuthPage } from "../../../../modules/auth/auth-shell.js"
import { useTranslation } from "react-i18next"

export function PasswordUpdatedPage() {
  const back = useAtomSet(backToLoginAction, { mode: "promiseExit" })
  const navigate = Route.useNavigate()
  const { locale } = Route.useParams()
  const { t } = useTranslation("auth", { keyPrefix: "passwordUpdated" })
  return (
    <AuthPage title={t("title")}>
      <Text>{t("description")}</Text>
      <BackToLoginButton onClick={() => {
        void back().then((exit) => {
          if (Exit.isSuccess(exit)) void navigate({ to: "/$locale/login", params: { locale } })
        })
      }} />
    </AuthPage>
  )
}

export const Route = createFileRoute("/$locale/_public/password-recovery/done")({
  component: PasswordUpdatedPage,
})
