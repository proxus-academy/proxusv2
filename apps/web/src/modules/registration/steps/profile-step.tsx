import { useAtomSet } from "@effect/atom-react"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import { Button, Heading } from "@proxus/ui"
import { RegistrationProfileForm } from "../forms.js"
import { DraftSummary } from "../registration-summary.js"
import { dispatchRegistrationAction } from "../state.js"

export function ProfileStep({ draft }: { readonly draft: RegistrationDraft }) {
  const dispatch = useAtomSet(dispatchRegistrationAction)
  return (
    <main>
      <Heading level={1}>Crea tu perfil</Heading>
      <RegistrationProfileForm.Provider defaultValues={{
        username: draft.username ?? "",
        birthYear: draft.birthYear ?? 2000,
      }}>
        <RegistrationProfileForm.KeepAlive />
        <RegistrationProfileForm.Form
          getSubmitArgs={() => (value) => dispatch({ _tag: "ProfileCompleted", ...value })}
        >
          <RegistrationProfileForm.username label="Nombre de usuario" />
          <RegistrationProfileForm.birthYear label="Año de nacimiento" />
          <RegistrationProfileForm.Submit asChild><Button>Continuar</Button></RegistrationProfileForm.Submit>
        </RegistrationProfileForm.Form>
      </RegistrationProfileForm.Provider>
      <DraftSummary draft={draft} />
    </main>
  )
}
