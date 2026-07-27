import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { useFormMessages } from "@proxus/frontend-web/form"
import { Button, Text } from "@proxus/ui"
import { AuthError, BackToLoginButton } from "../../modules/auth/auth-controls.js"
import { backToLoginAction, submitNewPasswordAction } from "../../modules/auth/actions.js"
import { NewPasswordForm } from "../../modules/auth/forms.js"
import { AuthPage } from "../../patterns/auth-page.js"

export function NewPasswordPage() {
  const submit = useAtomSet(submitNewPasswordAction)
  const result = useAtomValue(submitNewPasswordAction)
  const back = useAtomSet(backToLoginAction)
  const messages = useFormMessages()
  const copy = messages.auth.newPassword

  return (
    <AuthPage title={copy.title}>
      <Text tone="muted">{copy.description}</Text>
      <span className="sr-only">{copy.confirmation}</span>
      <NewPasswordForm.Provider defaultValues={{ password: "", confirmation: "" }}>
        <NewPasswordForm.Form
          className="space-y-4"
          getSubmitArgs={() => (value) => submit({ password: value.password })}
        >
          <NewPasswordForm.password
            label={copy.password}
            name="password"
            type="password"
            autoComplete="new-password"
          />
          <NewPasswordForm.confirmation
            label={copy.confirmation}
            name="confirmation"
            type="password"
            autoComplete="new-password"
          />
          <AuthError visible={result._tag === "Failure"} />
          <NewPasswordForm.Submit asChild>
            <Button disabled={result.waiting}>{copy.submit}</Button>
          </NewPasswordForm.Submit>
        </NewPasswordForm.Form>
      </NewPasswordForm.Provider>
      <BackToLoginButton onClick={() => back()} />
    </AuthPage>
  )
}
