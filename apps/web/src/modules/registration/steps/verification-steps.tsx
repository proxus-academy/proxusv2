import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { RegistrationDraft, RegistrationState } from "@proxus/frontend-core/registration"
import { Button, Checkbox, Heading, OtpInput, Text } from "@proxus/ui"
import { useEffect, useState, type FormEvent } from "react"
import { DraftSummary, RegistrationFailure } from "../registration-summary.js"
import {
  confirmGoogleRegistrationAction,
  registrationBusyAtom,
  resendRegistrationCodeAction,
  verifyRegistrationCodeAction,
} from "../state.js"
import { Trans, useTranslation } from "react-i18next"

export function EmailVerification({ state }: {
  readonly state: Extract<RegistrationState, { readonly _tag: "EmailVerificationPending" }>
}) {
  const verify = useAtomSet(verifyRegistrationCodeAction)
  const resend = useAtomSet(resendRegistrationCodeAction)
  const resendResult = useAtomValue(resendRegistrationCodeAction)
  const busy = useAtomValue(registrationBusyAtom)
  const [code, setCode] = useState("")
  // Registration has just issued a code and the server enforces the same cooldown.
  const [cooldown, setCooldown] = useState(60)
  const { t } = useTranslation("registration", { keyPrefix: "verification" })
  useEffect(() => {
    if (cooldown <= 0) return
    // UI-only countdown synchronized with wall time.
    // @effect-diagnostics-next-line globalTimers:off
    const timeout = globalThis.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1_000)
    return () => globalThis.clearTimeout(timeout)
  }, [cooldown])
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    verify({ code: String(new FormData(event.currentTarget).get("code")) })
  }
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-5 text-center">
      <Heading level={1}>{t("title")}</Heading>
      <Text>{t("sentTo", { email: state.maskedEmail })}</Text>
      <RegistrationFailure />
      <form onSubmit={onSubmit} className="flex w-full flex-col items-center gap-5">
        <OtpInput value={code} onChange={setCode} loading={busy} />
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button loading={busy} disabled={code.length !== 6} type="submit">{t("confirm")}</Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || cooldown > 0}
            onClick={() => {
              resend()
              setCooldown(60)
            }}
          >
            {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
          </Button>
        </div>
      </form>
      {resendResult._tag === "Success"
        ? <Text role="status">{t("resent")}</Text>
        : null}
      <Text tone="muted">{t("spam")}</Text>
    </main>
  )
}

export function ConfirmGoogle({ state }: {
  readonly state: Extract<RegistrationState, { readonly _tag: "ConfirmingGoogle" }>
}) {
  const draft = state.draft
  const confirm = useAtomSet(confirmGoogleRegistrationAction)
  const busy = useAtomValue(registrationBusyAtom)
  const [accepted, setAccepted] = useState(false)
  const { t } = useTranslation("registration", { keyPrefix: "verification" })
  return (
    <main>
      <Heading level={1}>{t("googleTitle")}</Heading>
      <Text>{t("verifiedEmail", { email: state.googleRegistration.email })}</Text>
      <DraftSummary draft={draft} />
      <RegistrationFailure />
      <form id="google-confirm" onSubmit={(event) => { event.preventDefault(); confirm() }}>
        <label className="flex items-start gap-2">
          <Checkbox
            checked={accepted}
            onCheckedChange={(checked) => setAccepted(checked === true)}
            aria-required="true"
            aria-label={t("accept")}
          />
          <span><Trans t={t} i18nKey="legal" components={{ terms: <a className="text-primary underline" href="https://proxus.es/terms" target="_blank" rel="noreferrer" />, privacy: <a className="text-primary underline" href="https://proxus.es/privacy" target="_blank" rel="noreferrer" /> }} /></span>
        </label>
        <Button loading={busy} disabled={!accepted} type="submit">{t("confirmGoogle")}</Button>
      </form>
    </main>
  )
}
