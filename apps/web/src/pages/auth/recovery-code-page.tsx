import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { recoveryStateAtom } from "@proxus/frontend-core/auth"
import { useFormMessages } from "../../platform/form/index.js"
import { Button, Text } from "@proxus/ui"
import { AuthError, BackToLoginButton } from "../../modules/auth/auth-controls.js"
import {
  backToLoginAction,
  recoveryCooldownLifecycleAtom,
  resendRecoveryCodeAction,
  submitRecoveryCodeAction,
} from "../../modules/auth/actions.js"
import { RecoveryCodeForm } from "../../modules/auth/forms.js"
import { AuthPage } from "../../patterns/auth-page.js"

export function RecoveryCodePage() {
  const recovery = useAtomValue(recoveryStateAtom)
  const submit = useAtomSet(submitRecoveryCodeAction)
  const submitForm = useAtomSet(RecoveryCodeForm.submit)
  const submitResult = useAtomValue(submitRecoveryCodeAction)
  const resend = useAtomSet(resendRecoveryCodeAction)
  const resendResult = useAtomValue(resendRecoveryCodeAction)
  const back = useAtomSet(backToLoginAction)
  useAtomValue(recoveryCooldownLifecycleAtom)
  const messages = useFormMessages()
  const copy = messages.auth.recoveryCode
  const cooldownSeconds = "cooldownSeconds" in recovery ? recovery.cooldownSeconds : 0
  const busy = submitResult.waiting || resendResult.waiting

  return (
    <AuthPage title={copy.title}>
      <Text tone="muted">{recovery.email}</Text>
      <RecoveryCodeForm.Initialize defaultValues={{ code: "" }}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            submitForm((value: { readonly code: string }) => submit({ code: value.code }))
          }}
        >
          <RecoveryCodeForm.code
            label={copy.code}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
          />
          <AuthError visible={submitResult._tag === "Failure" || resendResult._tag === "Failure"} />
          <Button type="submit" disabled={busy}>{copy.continue}</Button>
        </form>
      </RecoveryCodeForm.Initialize>
      <Button
        variant="secondary"
        disabled={busy || cooldownSeconds > 0}
        onClick={() => resend()}
      >
        {cooldownSeconds > 0 ? `Reenviar en ${cooldownSeconds}s` : copy.resend}
      </Button>
      <BackToLoginButton onClick={() => back()} />
    </AuthPage>
  )
}
