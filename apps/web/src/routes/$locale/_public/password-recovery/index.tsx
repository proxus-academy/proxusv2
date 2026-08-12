import { createFileRoute } from "@tanstack/react-router"
import { Exit } from "effect"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { recoveryStateAtom } from "@proxus/frontend-core/auth"
import { Button, Text } from "@proxus/ui"
import { AuthError, BackToLoginButton } from "../../../../modules/auth/auth-controls.js"
import { backToLoginAction, submitPasswordRecoveryAction } from "../../../../modules/auth/actions.js"
import { ForgotPasswordForm } from "../../../../modules/auth/forms.js"
import { AuthPage } from "../../../../modules/auth/auth-shell.js"
import { useTranslation } from "../../../../platform/product-locale/paraglide-react.js"

export function PasswordRecoveryPage() {
  const recovery = useAtomValue(recoveryStateAtom)
  const submit = useAtomSet(submitPasswordRecoveryAction, { mode: "promiseExit" })
  const submitForm = useAtomSet(ForgotPasswordForm.submit)
  const result = useAtomValue(submitPasswordRecoveryAction)
  const back = useAtomSet(backToLoginAction, { mode: "promiseExit" })
  const navigate = Route.useNavigate()
  const { locale } = Route.useParams()
  const { t } = useTranslation("auth")

  return (
    <AuthPage title={t("forgotPassword.title")}>
      <Text tone="muted">{t("forgotPassword.description")}</Text>
      <ForgotPasswordForm.Initialize defaultValues={{ email: recovery.email }}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            submitForm((value: { readonly email: string }) => {
              void submit({ email: value.email }).then((exit) => {
                if (Exit.isSuccess(exit)) {
                  void navigate({ to: "/$locale/password-recovery/code", params: { locale } })
                }
              })
            })
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
      <BackToLoginButton onClick={() => {
        void back().then((exit) => {
          if (Exit.isSuccess(exit)) void navigate({ to: "/$locale/login", params: { locale } })
        })
      }} />
    </AuthPage>
  )
}

export const Route = createFileRoute("/$locale/_public/password-recovery/")({
  component: PasswordRecoveryPage,
})
