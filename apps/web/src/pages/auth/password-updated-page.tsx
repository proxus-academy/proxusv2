import { useAtomSet } from "@effect/atom-react"
import { Text } from "@proxus/ui"
import { BackToLoginButton } from "../../modules/auth/auth-controls.js"
import { backToLoginAction } from "../../modules/auth/actions.js"
import { AuthPage } from "../../patterns/auth-page.js"
import { useTranslation } from "react-i18next"

export function PasswordUpdatedPage() {
  const back = useAtomSet(backToLoginAction)
  const { t } = useTranslation("auth", { keyPrefix: "passwordUpdated" })
  return (
    <AuthPage title={t("title")}>
      <Text>{t("description")}</Text>
      <BackToLoginButton onClick={() => back()} />
    </AuthPage>
  )
}
