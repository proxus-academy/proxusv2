import { useAtomSet } from "@effect/atom-react"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import { Button, Heading } from "@proxus/ui"
import { RegistrationProfileForm } from "../forms.js"
import { DraftSummary } from "../registration-summary.js"
import { dispatchRegistrationAction } from "../state.js"

export function ProfileStep({ draft }: { readonly draft: RegistrationDraft }) {
  const dispatch = useAtomSet(dispatchRegistrationAction)
  const submitForm = useAtomSet(RegistrationProfileForm.submit)
  return (
    <main>
      <Heading level={1}>Crea tu perfil</Heading>
      <RegistrationProfileForm.Initialize defaultValues={{
        username: draft.username ?? "",
        birthYear: draft.birthYear ?? 2000,
      }}>
        <RegistrationProfileForm.KeepAlive />
        <form onSubmit={(event) => {
          event.preventDefault()
          submitForm((value: { readonly username: string; readonly birthYear: number }) =>
            dispatch({ _tag: "ProfileCompleted", ...value }))
        }}>
          <RegistrationProfileForm.username label="Nombre de usuario" />
          <RegistrationProfileForm.birthYear label="Año de nacimiento" />
          <Button type="submit">Continuar</Button>
        </form>
      </RegistrationProfileForm.Initialize>
      <DraftSummary draft={draft} />
    </main>
  )
}
