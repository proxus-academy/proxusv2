import { useAtomSet } from "@effect/atom-react"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import { Button, Heading, Textarea } from "@proxus/ui"
import type { FormEvent } from "react"
import { problemLabels } from "../registration-copy.js"
import { dispatchRegistrationAction } from "../state.js"

export function ProblemStep({ draft }: { readonly draft: RegistrationDraft }) {
  const dispatch = useAtomSet(dispatchRegistrationAction)
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const submittedKind = String(data.get("problemKind"))
    const kind = problemLabels.find(([candidate]) => candidate === submittedKind)?.[0]
    if (kind === undefined) return
    const otherText = kind === "other" ? String(data.get("otherText") ?? "") : undefined
    dispatch({ _tag: "ProblemSelected", kind, ...(otherText === undefined ? {} : { otherText }) })
  }
  return (
    <main>
      <Heading level={1}>¿Qué quieres resolver?</Heading>
      <form onSubmit={onSubmit}>
        {problemLabels.map(([kind, label]) => (
          <label key={kind}>
            <input
              type="radio"
              name="problemKind"
              value={kind}
              required
              defaultChecked={draft.problemKind === kind}
            />
            {label}
          </label>
        ))}
        <label>
          Cuéntanos más
          <Textarea name="otherText" maxLength={280} defaultValue={draft.problemOtherText ?? ""} />
        </label>
        <Button type="submit">Continuar</Button>
      </form>
    </main>
  )
}
