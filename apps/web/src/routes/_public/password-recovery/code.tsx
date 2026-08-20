import { auth_recoveryCode_code, auth_recoveryCode_continue, auth_recoveryCode_resend, auth_recoveryCode_resendIn, auth_recoveryCode_title } from "../../../paraglide/messages.js"
import { createFileRoute } from "@tanstack/react-router"
import { Exit } from "effect"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { recoveryStateAtom } from "@proxus/frontend-core/auth"
import { Button, OtpInput, Text } from "@proxus/ui"
import { useState } from "react"
import { AuthError, BackToLoginButton } from "../../../modules/auth/auth-controls.js"
import {
  backToLoginAction,
  recoveryCooldownLifecycleAtom,
  resendRecoveryCodeAction,
  submitRecoveryCodeAction,
} from "../../../modules/auth/actions.js"
import { AuthPage } from "../../../modules/auth/auth-shell.js"

export function RecoveryCodePage() {
  const recovery = useAtomValue(recoveryStateAtom)
  const submit = useAtomSet(submitRecoveryCodeAction, { mode: "promiseExit" })
  const submitResult = useAtomValue(submitRecoveryCodeAction)
  const resend = useAtomSet(resendRecoveryCodeAction)
  const resendResult = useAtomValue(resendRecoveryCodeAction)
  const back = useAtomSet(backToLoginAction, { mode: "promiseExit" })
  const navigate = Route.useNavigate()
  useAtomValue(recoveryCooldownLifecycleAtom)
  const cooldownSeconds = "cooldownSeconds" in recovery ? recovery.cooldownSeconds : 0
  const busy = submitResult.waiting || resendResult.waiting
  const [code, setCode] = useState("")

  return (
    <AuthPage title={auth_recoveryCode_title()}>
      <Text tone="muted">{recovery.email}</Text>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault()
          void submit({ code }).then((exit) => {
            if (Exit.isSuccess(exit)) {
              void navigate({ to: "/password-recovery/new-password" })
            }
          })
        }}> 
          <OtpInput value={code} onChange={setCode} label={auth_recoveryCode_code()} loading={busy} />
          <AuthError visible={submitResult._tag === "Failure" || resendResult._tag === "Failure"} />
          <Button type="submit" loading={busy} disabled={code.length !== 6}>{auth_recoveryCode_continue()}</Button>
        </form>
      <Button
        variant="secondary"
        disabled={busy || cooldownSeconds > 0}
        onClick={() => resend()}
      >
        {cooldownSeconds > 0 ? auth_recoveryCode_resendIn({ seconds: cooldownSeconds }) : auth_recoveryCode_resend()}
      </Button>
      <BackToLoginButton onClick={() => {
        void back().then((exit) => {
          if (Exit.isSuccess(exit)) void navigate({ to: "/login" })
        })
      }} />
    </AuthPage>
  )
}

export const Route = createFileRoute("/_public/password-recovery/code")({
  component: RecoveryCodePage,
})
