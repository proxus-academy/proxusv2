import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { recoveryStateAtom } from "@proxus/frontend-core/auth"
import { Button, Text } from "@proxus/ui"
import { AuthError, BackToLoginButton } from "../../modules/auth/auth-controls.js"
import { backToLoginAction, submitPasswordRecoveryAction } from "../../modules/auth/actions.js"
import { ForgotPasswordForm } from "../../modules/auth/forms.js"
import { AuthPage } from "../../patterns/auth-page.js"
import { useTranslation } from "react-i18next"

export function PasswordRecoveryPage() {
  const recovery = useAtomValue(recoveryStateAtom)
  const submit = useAtomSet(submitPasswordRecoveryAction)
  const submitForm = useAtomSet(ForgotPasswordForm.submit)
  const result = useAtomValue(submitPasswordRecoveryAction)
  const back = useAtomSet(backToLoginAction)
  const { t } = useTranslation("auth")

  return (
    <AuthPage title={t("forgotPassword.title")}>
      <Text tone="muted">{t("forgotPassword.description")}</Text>
      <ForgotPasswordForm.Initialize defaultValues={{ email: recovery.email }}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            submitForm((value: { readonly email: string }) => submit({ email: value.email }))
          }}
        >
          <ForgotPasswordForm.email
            label={t("login.email")}
            name="email"
            type="email"
            autoComplete="email"
          />
          <AuthError visible={result._tag === "Failure"} />
          <Button type="submit" disabled={result.waiting}>{t("forgotPassword.submit")}</Button>
        </form>
      </ForgotPasswordForm.Initialize>
      <BackToLoginButton onClick={() => back()} />
    </AuthPage>
  )
}
