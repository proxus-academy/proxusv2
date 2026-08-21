import { registration_verification_accept, registration_verification_confirm, registration_verification_confirmGoogle, registration_verification_googleTitle, registration_verification_resend, registration_verification_resendIn, registration_verification_resent, registration_verification_sentTo, registration_verification_spam, registration_verification_title, registration_verification_verifiedEmail, registration_verification_legal } from "../../../paraglide/messages.js"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { RegistrationDraft, RegistrationState } from "@proxus/frontend-core/registration"
import { Exit } from "effect"
import { Button, Checkbox, Heading, OtpInput, Text } from "@proxus/ui"
import { useEffect, useState, type FormEvent } from "react"
import { DraftSummary, RegistrationFailure } from "../registration-summary.js"
import {
  confirmGoogleRegistrationAction,
  registrationBusyAtom,
  resendRegistrationCodeAction,
  verifyRegistrationCodeAction,
} from "../state.js"
import { RichText } from "../../../platform/rich-text.js"

export function EmailVerification({ state, onComplete = () => Promise.resolve() }: {
  readonly state: Extract<RegistrationState, { readonly _tag: "EmailVerificationPending" }>
  readonly onComplete?: () => Promise<void>
}) {
  const verify = useAtomSet(verifyRegistrationCodeAction, { mode: "promiseExit" })
  const resend = useAtomSet(resendRegistrationCodeAction)
  const resendResult = useAtomValue(resendRegistrationCodeAction)
  const busy = useAtomValue(registrationBusyAtom)
  const [code, setCode] = useState("")
  // Registration has just issued a code and the server enforces the same cooldown.
  const [cooldown, setCooldown] = useState(60)
  useEffect(() => {
    if (cooldown <= 0) return
    // UI-only countdown synchronized with wall time.
    // @effect-diagnostics-next-line globalTimers:off
    const timeout = globalThis.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1_000)
    return () => globalThis.clearTimeout(timeout)
  }, [cooldown])
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void verify({ code: String(new FormData(event.currentTarget).get("code")) })
      .then((exit) => {
        if (Exit.isSuccess(exit)) void onComplete()
      })
      .catch((error: unknown) => globalThis.reportError(error))
  }
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-5 text-center">
      <Heading level={1}>{registration_verification_title()}</Heading>
      <Text>{registration_verification_sentTo({ email: state.maskedEmail })}</Text>
      <RegistrationFailure />
      <form onSubmit={onSubmit} className="flex w-full flex-col items-center gap-5">
        <OtpInput value={code} onChange={setCode} loading={busy} />
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button loading={busy} disabled={code.length !== 6} type="submit">{registration_verification_confirm()}</Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || cooldown > 0}
            onClick={() => {
              resend()
              setCooldown(60)
            }}
          >
            {cooldown > 0 ? registration_verification_resendIn({ seconds: cooldown }) : registration_verification_resend()}
          </Button>
        </div>
      </form>
      {resendResult._tag === "Success"
        ? <Text role="status">{registration_verification_resent()}</Text>
        : null}
      <Text tone="muted">{registration_verification_spam()}</Text>
    </main>
  )
}

export function ConfirmGoogle({ state, onComplete = () => Promise.resolve() }: {
  readonly state: Extract<RegistrationState, { readonly _tag: "ConfirmingGoogle" }>
  readonly onComplete?: () => Promise<void>
}) {
  const draft = state.draft
  const confirm = useAtomSet(confirmGoogleRegistrationAction, { mode: "promiseExit" })
  const busy = useAtomValue(registrationBusyAtom)
  const [accepted, setAccepted] = useState(false)
  return (
    <main>
      <Heading level={1}>{registration_verification_googleTitle()}</Heading>
      <Text>{registration_verification_verifiedEmail({ email: state.googleRegistration.email })}</Text>
      <DraftSummary draft={draft} />
      <RegistrationFailure />
      <form id="google-confirm" onSubmit={(event) => {
        event.preventDefault()
        void confirm()
          .then((exit) => {
            if (Exit.isSuccess(exit)) void onComplete()
          })
          .catch((error: unknown) => globalThis.reportError(error))
      }}>
        <label className="flex items-start gap-2">
          <Checkbox
            checked={accepted}
            onCheckedChange={(checked) => setAccepted(checked === true)}
            aria-required="true"
            aria-label={registration_verification_accept()}
          />
          <span>
            <RichText
              message={registration_verification_legal()}
              components={{
                terms: (children) => <a className="text-primary underline" href="https://proxus.es/terms" target="_blank" rel="noreferrer">{children}</a>,
                privacy: (children) => <a className="text-primary underline" href="https://proxus.es/privacy" target="_blank" rel="noreferrer">{children}</a>,
              }}
            />
          </span>
        </label>
        <Button loading={busy} disabled={!accepted} type="submit">{registration_verification_confirmGoogle()}</Button>
      </form>
    </main>
  )
}
