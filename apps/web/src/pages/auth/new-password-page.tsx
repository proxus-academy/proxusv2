import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { useFormMessages } from "../../platform/form/index.js"
import { Button, Text } from "@proxus/ui"
import { AuthError, BackToLoginButton } from "../../modules/auth/auth-controls.js"
import { backToLoginAction, submitNewPasswordAction } from "../../modules/auth/actions.js"
import { NewPasswordForm } from "../../modules/auth/forms.js"
import { AuthPage } from "../../patterns/auth-page.js"

export function NewPasswordPage() {
  const submit = useAtomSet(submitNewPasswordAction)
  const submitForm = useAtomSet(NewPasswordForm.submit)
  const result = useAtomValue(submitNewPasswordAction)
  const back = useAtomSet(backToLoginAction)
  const messages = useFormMessages()
  const copy = messages.auth.newPassword

  return (
    <AuthPage title={copy.title}>
      <Text tone="muted">{copy.description}</Text>
      <span className="sr-only">{copy.confirmation}</span>
      <NewPasswordForm.Initialize defaultValues={{ password: "", confirmation: "" }}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            submitForm((value: { readonly password: string }) => submit({ password: value.password }))
          }}
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
          <Button type="submit" disabled={result.waiting}>{copy.submit}</Button>
        </form>
      </NewPasswordForm.Initialize>
      <BackToLoginButton onClick={() => back()} />
    </AuthPage>
  )
}
