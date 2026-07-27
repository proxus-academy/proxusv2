import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import { Button, Heading } from "@proxus/ui"
import { RegistrationAccountForm } from "../forms.js"
import { DraftSummary, RegistrationFailure } from "../registration-summary.js"
import {
  registrationBusyAtom,
  submitEmailRegistrationAction,
} from "../state.js"

export function AccountStep({ draft }: { readonly draft: RegistrationDraft }) {
  const submitAccount = useAtomSet(submitEmailRegistrationAction)
  const busy = useAtomValue(registrationBusyAtom)
  return (
    <main>
      <Heading level={1}>Crea tu cuenta</Heading>
      <DraftSummary draft={draft} />
      <RegistrationFailure />
      <RegistrationAccountForm.Provider defaultValues={{ email: "", password: "", terms: false }}>
        <RegistrationAccountForm.KeepAlive />
        <RegistrationAccountForm.Form
          getSubmitArgs={() => ({ email, password }) => submitAccount({ email, password })}
        >
          <RegistrationAccountForm.email label="Email" type="email" />
          <RegistrationAccountForm.password label="Contraseña" type="password" />
          <RegistrationAccountForm.terms label="Acepto los términos y la privacidad" />
          <RegistrationAccountForm.Submit asChild>
            <Button disabled={busy}>Crear cuenta</Button>
          </RegistrationAccountForm.Submit>
        </RegistrationAccountForm.Form>
      </RegistrationAccountForm.Provider>
    </main>
  )
}
