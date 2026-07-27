import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { recoveryStateAtom } from "@proxus/frontend-core/auth"
import { useFormMessages } from "@proxus/frontend-web/form"
import { Button, Text } from "@proxus/ui"
import { AuthError, BackToLoginButton } from "../../modules/auth/auth-controls.js"
import { backToLoginAction, submitPasswordRecoveryAction } from "../../modules/auth/actions.js"
import { ForgotPasswordForm } from "../../modules/auth/forms.js"
import { AuthPage } from "../../patterns/auth-page.js"

export function PasswordRecoveryPage() {
  const recovery = useAtomValue(recoveryStateAtom)
  const submit = useAtomSet(submitPasswordRecoveryAction)
  const result = useAtomValue(submitPasswordRecoveryAction)
  const back = useAtomSet(backToLoginAction)
  const messages = useFormMessages()
  const copy = messages.auth.forgotPassword

  return (
    <AuthPage title={copy.title}>
      <Text tone="muted">{copy.description}</Text>
      <ForgotPasswordForm.Provider defaultValues={{ email: recovery.email }}>
        <ForgotPasswordForm.Form
          className="space-y-4"
          getSubmitArgs={() => (value) => submit({ email: value.email })}
        >
          <ForgotPasswordForm.email
            label={messages.auth.login.email}
            name="email"
            type="email"
            autoComplete="email"
          />
          <AuthError visible={result._tag === "Failure"} />
          <ForgotPasswordForm.Submit asChild>
            <Button disabled={result.waiting}>{copy.submit}</Button>
          </ForgotPasswordForm.Submit>
        </ForgotPasswordForm.Form>
      </ForgotPasswordForm.Provider>
      <BackToLoginButton onClick={() => back()} />
    </AuthPage>
  )
}
