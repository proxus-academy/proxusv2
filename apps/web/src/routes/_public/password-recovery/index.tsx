import { auth_forgotPassword_description, auth_forgotPassword_submit, auth_forgotPassword_title, auth_login_email } from "../../../paraglide/messages.js"
import { createFileRoute } from "@tanstack/react-router"
import { Exit } from "effect"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { recoveryStateAtom } from "@proxus/frontend-core/auth"
import { Button, Form, Text } from "@proxus/ui"
import { AuthError, BackToLoginButton } from "../../../modules/auth/auth-controls.js"
import { backToLoginAction, submitPasswordRecoveryAction } from "../../../modules/auth/actions.js"
import { ForgotPasswordForm } from "../../../modules/auth/forms.js"
import { AuthPage } from "../../../modules/auth/auth-shell.js"

export function PasswordRecoveryPage() {
  const recovery = useAtomValue(recoveryStateAtom)
  const submit = useAtomSet(submitPasswordRecoveryAction, { mode: "promiseExit" })
  const submitForm = useAtomSet(ForgotPasswordForm.submit)
  const result = useAtomValue(submitPasswordRecoveryAction)
  const back = useAtomSet(backToLoginAction, { mode: "promiseExit" })
  const navigate = Route.useNavigate()

  return (
    <AuthPage title={auth_forgotPassword_title()}>
      <Text tone="muted">{auth_forgotPassword_description()}</Text>
      <ForgotPasswordForm.Initialize defaultValues={{ email: recovery.email }}>
        <Form
          gap="lg"
          onSubmit={(event) => {
            event.preventDefault()
            submitForm((value: { readonly email: string }) => {
              void submit({ email: value.email }).then((exit) => {
                if (Exit.isSuccess(exit)) {
                  void navigate({ to: "/password-recovery/code" })
                }
              })
            })
          }}
        >
          <ForgotPasswordForm.email
            label={auth_login_email()}
            name="email"
            type="email"
            autoComplete="email"
          />
          <AuthError visible={result._tag === "Failure"} />
          <Button type="submit" disabled={result.waiting}>{auth_forgotPassword_submit()}</Button>
        </Form>
      </ForgotPasswordForm.Initialize>
      <BackToLoginButton onClick={() => {
        void back().then((exit) => {
          if (Exit.isSuccess(exit)) void navigate({ to: "/login" })
        })
      }} />
    </AuthPage>
  )
}

export const Route = createFileRoute("/_public/password-recovery/")({
  component: PasswordRecoveryPage,
})
