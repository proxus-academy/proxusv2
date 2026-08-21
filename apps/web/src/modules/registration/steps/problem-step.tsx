import { registration_problem_continue, registration_problem_description, registration_problem_labels_chooseStudies, registration_problem_labels_organizeStudy, registration_problem_labels_other, registration_problem_labels_prepareExams, registration_problem_labels_understandContent, registration_problem_otherDescription, registration_problem_otherLabel, registration_problem_otherTitle, registration_problem_title } from "../../../paraglide/messages.js"
import { useAtomSet } from "@effect/atom-react"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import { Button, ChoiceCard, Form, Grid, Heading, Inline, Stack, Text, Textarea } from "@proxus/ui"
import { useState, type FormEvent } from "react"
import { problemKinds } from "../registration-copy.js"
import { dispatchRegistrationAction, editRegistrationStepAction } from "../state.js"

const problemLabels = { "understand-content": registration_problem_labels_understandContent, "prepare-exams": registration_problem_labels_prepareExams, "organize-study": registration_problem_labels_organizeStudy, "choose-studies": registration_problem_labels_chooseStudies, other: registration_problem_labels_other }

export function ProblemStep() {
  const dispatch = useAtomSet(dispatchRegistrationAction)
  const edit = useAtomSet(editRegistrationStepAction)
  return (
    <Stack as="main" gap="xl">
      <Heading level={1}>{registration_problem_title()}</Heading>
      <Text tone="muted">{registration_problem_description()}</Text>
      <Grid columns={{ base: "one", md: "two" }} gap="md">
        {problemKinds.map((kind) => (
          <ChoiceCard
            key={kind}
            type="button"
            onClick={() => kind === "other"
              ? edit("problem-other")
              : dispatch({ _tag: "ProblemSelected", kind })}
            title={problemLabels[kind]()}
          />
        ))}
      </Grid>
    </Stack>
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
    <Stack as="main" gap="xl">
      <Heading level={1}>{registration_problem_otherTitle()}</Heading>
      <Text tone="muted">{registration_problem_otherDescription()}</Text>
      <Form gap="lg" onSubmit={onSubmit}>
        <Textarea
          aria-label={registration_problem_otherLabel()}
          autoFocus
          rows={6}
          maxLength={280}
          required
          value={otherText}
          onChange={(event) => setOtherText(event.currentTarget.value)}
        />
        <Inline justify="between">
          <Text size="sm" tone="muted">{otherText.length}/280</Text>
          <Button disabled={otherText.trim().length === 0} type="submit">{registration_problem_continue()}</Button>
        </Inline>
      </Form>
    </Stack>
  )
}
