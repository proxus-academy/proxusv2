import { registration_problem_continue, registration_problem_description, registration_problem_labels_chooseStudies, registration_problem_labels_organizeStudy, registration_problem_labels_other, registration_problem_labels_prepareExams, registration_problem_labels_understandContent, registration_problem_otherDescription, registration_problem_otherLabel, registration_problem_otherTitle, registration_problem_title } from "../../../paraglide/messages.js"
import { useAtomSet } from "@effect/atom-react"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import { Button, Heading, Text, Textarea } from "@proxus/ui"
import { useState, type FormEvent } from "react"
import { problemKinds } from "../registration-copy.js"
import { dispatchRegistrationAction, editRegistrationStepAction } from "../state.js"

const problemLabels = { "understand-content": registration_problem_labels_understandContent, "prepare-exams": registration_problem_labels_prepareExams, "organize-study": registration_problem_labels_organizeStudy, "choose-studies": registration_problem_labels_chooseStudies, other: registration_problem_labels_other }

export function ProblemStep() {
  const dispatch = useAtomSet(dispatchRegistrationAction)
  const edit = useAtomSet(editRegistrationStepAction)
  return (
    <main className="space-y-7">
      <Heading level={1}>{registration_problem_title()}</Heading>
      <Text className="-mt-4" tone="muted">{registration_problem_description()}</Text>
      <div className="grid gap-3 sm:grid-cols-2">
        {problemKinds.map((kind) => (
          <button
            className="problem-choice"
            key={kind}
            type="button"
            onClick={() => kind === "other"
              ? edit("problem-other")
              : dispatch({ _tag: "ProblemSelected", kind })}
          >
            <span>{problemLabels[kind]()}</span>
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
      <Heading level={1}>{registration_problem_otherTitle()}</Heading>
      <Text className="-mt-4" tone="muted">{registration_problem_otherDescription()}</Text>
      <form className="space-y-4" onSubmit={onSubmit}>
        <Textarea
          aria-label={registration_problem_otherLabel()}
          autoFocus
          className="min-h-36 bg-white"
          maxLength={280}
          required
          value={otherText}
          onChange={(event) => setOtherText(event.currentTarget.value)}
        />
        <div className="flex items-center justify-between">
          <Text className="text-sm" tone="muted">{otherText.length}/280</Text>
          <Button disabled={otherText.trim().length === 0} type="submit">{registration_problem_continue()}</Button>
        </div>
      </form>
    </main>
  )
}
