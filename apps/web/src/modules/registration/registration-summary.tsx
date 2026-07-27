import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import { Button, Heading, Text } from "@proxus/ui"
import { problemLabels } from "./registration-copy.js"
import {
  editRegistrationStepAction,
  registrationFailedAtom,
} from "./state.js"

export function DraftSummary({ draft }: { readonly draft: RegistrationDraft }) {
  const edit = useAtomSet(editRegistrationStepAction)
  const problem = problemLabels.find(([kind]) => kind === draft.problemKind)?.[1]
  return (
    <aside aria-label="Resumen del registro" className="rounded-xl border bg-card p-4">
      <Heading level={2}>Tu resumen</Heading>
      <dl>
        <dt>Problema</dt>
        <dd>
          {draft.problemOtherText ?? problem ?? "Pendiente"}
          <Button type="button" variant="ghost" onClick={() => edit("problem")}>Editar problema</Button>
        </dd>
        <dt>Estudios</dt>
        <dd>
          {draft.path.map((node) => node.name).join(" → ") || "Pendiente"}
          <Button type="button" variant="ghost" onClick={() => edit("country")}>Editar estudios</Button>
        </dd>
        <dt>Perfil</dt>
        <dd>
          {draft.username === undefined ? "Pendiente" : `${draft.username}, ${String(draft.birthYear)}`}
          <Button type="button" variant="ghost" onClick={() => edit("profile")}>Editar perfil</Button>
        </dd>
      </dl>
    </aside>
  )
}

export function RegistrationFailure() {
  const failed = useAtomValue(registrationFailedAtom)
  return failed
    ? <Text role="alert">No hemos podido completar la operación. Inténtalo de nuevo.</Text>
    : null
}
