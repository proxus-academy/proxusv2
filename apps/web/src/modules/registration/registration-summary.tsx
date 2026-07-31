import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import { Button, Card, CardContent, CardHeader, CardTitle, Text } from "@proxus/ui"
import { problemLabels } from "./registration-copy.js"
import {
  editRegistrationStepAction,
  registrationErrorMessageAtom,
} from "./state.js"

export function DraftSummary({ draft }: { readonly draft: RegistrationDraft }) {
  const edit = useAtomSet(editRegistrationStepAction)
  const problem = problemLabels.find(([kind]) => kind === draft.problemKind)?.[1]
  return (
    <Card aria-label="Resumen del registro" className="mt-6">
      <CardHeader><CardTitle>Tu resumen</CardTitle></CardHeader>
      <CardContent>
      <dl className="space-y-4">
        <div><dt className="text-sm font-semibold text-muted-foreground">Problema</dt>
        <dd className="flex items-center justify-between gap-4">
          {draft.problemOtherText ?? problem ?? "Pendiente"}
          <Button type="button" variant="ghost" onClick={() => edit("problem")}>Editar problema</Button>
        </dd></div>
        <div><dt className="text-sm font-semibold text-muted-foreground">Estudios</dt>
        <dd className="flex items-center justify-between gap-4">
          {draft.path.map((node) => node.name).join(" → ") || "Pendiente"}
          <Button type="button" variant="ghost" onClick={() => edit("study")}>Editar estudios</Button>
        </dd></div>
        <div><dt className="text-sm font-semibold text-muted-foreground">Perfil</dt>
        <dd className="flex items-center justify-between gap-4">
          {draft.username === undefined ? "Pendiente" : `${draft.username}, ${String(draft.birthYear)}`}
          <Button type="button" variant="ghost" onClick={() => edit("profile")}>Editar perfil</Button>
        </dd></div>
      </dl>
      </CardContent>
    </Card>
  )
}

export function RegistrationFailure() {
  const message = useAtomValue(registrationErrorMessageAtom)
  return message === undefined
    ? null
    : <Text role="alert">{message}</Text>
}
