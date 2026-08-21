import { auth_newPassword_confirmation, auth_newPassword_description, auth_newPassword_password, auth_newPassword_submit, auth_newPassword_title } from "../../../paraglide/messages.js"
import { createFileRoute } from "@tanstack/react-router"
import { Exit } from "effect"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Button, Form, Text, VisuallyHidden } from "@proxus/ui"
import { AuthError, BackToLoginButton } from "../../../modules/auth/auth-controls.js"
import { backToLoginAction, submitNewPasswordAction } from "../../../modules/auth/actions.js"
import { NewPasswordForm } from "../../../modules/auth/forms.js"
import { AuthPage } from "../../../modules/auth/auth-shell.js"

export function NewPasswordPage() {
  const submit = useAtomSet(submitNewPasswordAction, { mode: "promiseExit" })
  const submitForm = useAtomSet(NewPasswordForm.submit)
  const result = useAtomValue(submitNewPasswordAction)
  const back = useAtomSet(backToLoginAction, { mode: "promiseExit" })
  const navigate = Route.useNavigate()

  return (
    <AuthPage title={auth_newPassword_title()}>
      <Text tone="muted">{auth_newPassword_description()}</Text>
      <VisuallyHidden>{auth_newPassword_confirmation()}</VisuallyHidden>
      <NewPasswordForm.Initialize defaultValues={{ password: "", confirmation: "" }}>
        <Form
          gap="lg"
          onSubmit={(event) => {
            event.preventDefault()
            submitForm((value: { readonly password: string }) => {
              void submit({ password: value.password }).then((exit) => {
                if (Exit.isSuccess(exit)) {
                  void navigate({ to: "/password-recovery/done" })
                }
              })
            })
          }}
        >
          <NewPasswordForm.password
            label={auth_newPassword_password()}
            name="password"
            type="password"
            autoComplete="new-password"
          />
          <NewPasswordForm.confirmation
            label={auth_newPassword_confirmation()}
            name="confirmation"
            type="password"
            autoComplete="new-password"
          />
          <AuthError visible={result._tag === "Failure"} />
          <Button type="submit" disabled={result.waiting}>{auth_newPassword_submit()}</Button>
        </Form>
      </NewPasswordForm.Initialize>
      <BackToLoginButton onClick={() => {
        void back().then((exit) => {
          if (Exit.isSuccess(exit)) void navigate({ to: "/login" })
        })
      }} />
    </AuthPage>
  )
}

export const Route = createFileRoute("/_public/password-recovery/new-password")({
  component: NewPasswordPage,
})
