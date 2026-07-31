import { Button, Text } from "@proxus/ui"
import { useTranslation } from "react-i18next"

export function AuthError({ visible, message }: {
  readonly visible: boolean
  readonly message?: string
}) {
  const { t } = useTranslation(["errors", "common"])
  return visible
    ? <Text role="alert" tone="muted">{message ?? t("unexpected", { ns: "errors" })}</Text>
    : null
}

export function BackToLoginButton({ onClick }: { readonly onClick: () => void }) {
  const { t } = useTranslation("common")
  return <Button variant="ghost" onClick={onClick}>{t("back")}</Button>
}

export function LogoutButton({ busy, error, onLogout }: {
  readonly busy?: boolean
  readonly error?: boolean
  readonly onLogout: () => void
}) {
  const { t } = useTranslation("auth", { keyPrefix: "session" })
  return (
    <div>
      <Button variant="ghost" disabled={busy === true} onClick={onLogout}>
        {busy === true ? t("signingOut") : t("signOut")}
      </Button>
      <AuthError visible={error === true} />
    </div>
  )
}
