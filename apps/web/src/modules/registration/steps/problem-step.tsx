import { useAtomSet } from "@effect/atom-react"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import { Button, Heading, Text, Textarea } from "@proxus/ui"
import { useState, type FormEvent } from "react"
import { problemLabels } from "../registration-copy.js"
import { dispatchRegistrationAction, editRegistrationStepAction } from "../state.js"

export function ProblemStep() {
  const dispatch = useAtomSet(dispatchRegistrationAction)
  const edit = useAtomSet(editRegistrationStepAction)
  return (
    <main className="space-y-7">
      <Heading level={1}>¿Qué quieres resolver?</Heading>
      <Text className="-mt-4" tone="muted">Elige tu objetivo principal.</Text>
      <div className="grid gap-3 sm:grid-cols-2">
        {problemLabels.map(([kind, label]) => (
          <button
            className="problem-choice"
            key={kind}
            type="button"
            onClick={() => kind === "other"
              ? edit("problem-other")
              : dispatch({ _tag: "ProblemSelected", kind })}
          >
            <span>{label}</span>
          </button>
        ))}
      </div>
    </main>
  )
}

export function ProblemOtherStep({ draft }: { readonly draft: RegistrationDraft }) {
  const dispatch = useAtomSet(dispatchRegistrationAction)
  const [otherText, setOtherText] = useState(draft.problemOtherText ?? "")
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    dispatch({ _tag: "ProblemSelected", kind: "other", otherText })
  }
  return (
    <main className="space-y-7">
      <Heading level={1}>Cuéntanos qué necesitas</Heading>
      <Text className="-mt-4" tone="muted">Describe brevemente qué te gustaría resolver con Proxus.</Text>
      <form className="space-y-4" onSubmit={onSubmit}>
        <Textarea
          aria-label="Qué quieres resolver"
          autoFocus
          className="min-h-36 bg-white"
          maxLength={280}
          required
          value={otherText}
          onChange={(event) => setOtherText(event.currentTarget.value)}
        />
        <div className="flex items-center justify-between">
          <Text className="text-sm" tone="muted">{otherText.length}/280</Text>
          <Button disabled={otherText.trim().length === 0} type="submit">Continuar</Button>
        </div>
      </form>
    </main>
  )
}
