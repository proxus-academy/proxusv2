import { createFileRoute } from "@tanstack/react-router"
import { Exit } from "effect"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Button, Text } from "@proxus/ui"
import { AuthError, BackToLoginButton } from "../../../../modules/auth/auth-controls.js"
import { backToLoginAction, submitNewPasswordAction } from "../../../../modules/auth/actions.js"
import { NewPasswordForm } from "../../../../modules/auth/forms.js"
import { AuthPage } from "../../../../modules/auth/auth-shell.js"
import { useTranslation } from "../../../../platform/product-locale/paraglide-react.js"

export function NewPasswordPage() {
  const submit = useAtomSet(submitNewPasswordAction, { mode: "promiseExit" })
  const submitForm = useAtomSet(NewPasswordForm.submit)
  const result = useAtomValue(submitNewPasswordAction)
  const back = useAtomSet(backToLoginAction, { mode: "promiseExit" })
  const navigate = Route.useNavigate()
  const { locale } = Route.useParams()
  const { t } = useTranslation("auth", { keyPrefix: "newPassword" })

  return (
    <AuthPage title={t("title")}>
      <Text tone="muted">{t("description")}</Text>
      <span className="sr-only">{t("confirmation")}</span>
      <NewPasswordForm.Initialize defaultValues={{ password: "", confirmation: "" }}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            submitForm((value: { readonly password: string }) => {
              void submit({ password: value.password }).then((exit) => {
                if (Exit.isSuccess(exit)) {
                  void navigate({ to: "/$locale/password-recovery/done", params: { locale } })
                }
              })
            })
          }}
        >
          <NewPasswordForm.password
            label={t("password")}
            name="password"
            type="password"
            autoComplete="new-password"
          />
          <NewPasswordForm.confirmation
            label={t("confirmation")}
            name="confirmation"
            type="password"
            autoComplete="new-password"
          />
          <AuthError visible={result._tag === "Failure"} />
          <Button type="submit" disabled={result.waiting}>{t("submit")}</Button>
        </form>
      </NewPasswordForm.Initialize>
      <BackToLoginButton onClick={() => {
        void back().then((exit) => {
          if (Exit.isSuccess(exit)) void navigate({ to: "/$locale/login", params: { locale } })
        })
      }} />
    </AuthPage>
  )
}

export const Route = createFileRoute("/$locale/_public/password-recovery/new-password")({
  component: NewPasswordPage,
})
