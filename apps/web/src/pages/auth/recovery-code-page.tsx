import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { recoveryStateAtom } from "@proxus/frontend-core/auth"
import { Button, OtpInput, Text } from "@proxus/ui"
import { useState } from "react"
import { AuthError, BackToLoginButton } from "../../modules/auth/auth-controls.js"
import {
  backToLoginAction,
  recoveryCooldownLifecycleAtom,
  resendRecoveryCodeAction,
  submitRecoveryCodeAction,
} from "../../modules/auth/actions.js"
import { AuthPage } from "../../patterns/auth-page.js"
import { useTranslation } from "react-i18next"

export function RecoveryCodePage() {
  const recovery = useAtomValue(recoveryStateAtom)
  const submit = useAtomSet(submitRecoveryCodeAction)
  const submitResult = useAtomValue(submitRecoveryCodeAction)
  const resend = useAtomSet(resendRecoveryCodeAction)
  const resendResult = useAtomValue(resendRecoveryCodeAction)
  const back = useAtomSet(backToLoginAction)
  useAtomValue(recoveryCooldownLifecycleAtom)
  const { t } = useTranslation("auth", { keyPrefix: "recoveryCode" })
  const cooldownSeconds = "cooldownSeconds" in recovery ? recovery.cooldownSeconds : 0
  const busy = submitResult.waiting || resendResult.waiting
  const [code, setCode] = useState("")

  return (
    <AuthPage title={t("title")}>
      <Text tone="muted">{recovery.email}</Text>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submit({ code }) }}>
          <OtpInput value={code} onChange={setCode} label={t("code")} loading={busy} />
          <AuthError visible={submitResult._tag === "Failure" || resendResult._tag === "Failure"} />
          <Button type="submit" loading={busy} disabled={code.length !== 6}>{t("continue")}</Button>
        </form>
      <Button
        variant="secondary"
        disabled={busy || cooldownSeconds > 0}
        onClick={() => resend()}
      >
        {cooldownSeconds > 0 ? t("resendIn", { seconds: cooldownSeconds }) : t("resend")}
      </Button>
      <BackToLoginButton onClick={() => back()} />
    </AuthPage>
  )
}
