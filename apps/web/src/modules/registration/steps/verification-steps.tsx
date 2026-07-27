import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { RegistrationDraft, RegistrationState } from "@proxus/frontend-core/registration"
import { Button, Heading, Input, Text } from "@proxus/ui"
import type { FormEvent } from "react"
import { DraftSummary, RegistrationFailure } from "../registration-summary.js"
import {
  confirmGoogleRegistrationAction,
  googleRegistrationDraftAtom,
  registrationBusyAtom,
  resendRegistrationCodeAction,
  verifyRegistrationCodeAction,
} from "../state.js"

export function EmailVerification({ state }: {
  readonly state: Extract<RegistrationState, { readonly _tag: "EmailVerificationPending" }>
}) {
  const verify = useAtomSet(verifyRegistrationCodeAction)
  const resend = useAtomSet(resendRegistrationCodeAction)
  const busy = useAtomValue(registrationBusyAtom)
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    verify({ code: String(new FormData(event.currentTarget).get("code")) })
  }
  return (
    <main>
      <Heading level={1}>Verifica tu cuenta</Heading>
      <Text>Hemos enviado un código a {state.maskedEmail}.</Text>
      <RegistrationFailure />
      <form onSubmit={onSubmit}>
        <label>
          Código de seis dígitos
          <Input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" />
        </label>
        <Button disabled={busy} type="submit">Confirmar código</Button>
      </form>
      <Button variant="ghost" disabled={busy} onClick={() => resend()}>Reenviar código</Button>
    </main>
  )
}

export function ConfirmGoogle({ draft }: { readonly draft: RegistrationDraft }) {
  const googleDraft = useAtomValue(googleRegistrationDraftAtom)
  const confirm = useAtomSet(confirmGoogleRegistrationAction)
  const busy = useAtomValue(registrationBusyAtom)
  return (
    <main>
      <Heading level={1}>Confirma tus datos de Google</Heading>
      <Text>Email verificado: {googleDraft?.email ?? "Cuenta de Google"}</Text>
      <DraftSummary draft={draft} />
      <RegistrationFailure />
      <label><input type="checkbox" required form="google-confirm" /> Acepto los términos y la privacidad</label>
      <form id="google-confirm" onSubmit={(event) => { event.preventDefault(); confirm() }}>
        <Button disabled={busy} type="submit">Confirmar alta</Button>
      </form>
    </main>
  )
}
