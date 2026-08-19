import { registration_failure_conflict, registration_failure_invalidCode, registration_failure_network, registration_failure_unexpected, registration_problem_labels_chooseStudies, registration_problem_labels_organizeStudy, registration_problem_labels_other, registration_problem_labels_prepareExams, registration_problem_labels_understandContent, registration_summary_editProblem, registration_summary_editProfile, registration_summary_editStudies, registration_summary_label, registration_summary_pending, registration_summary_problem, registration_summary_profile, registration_summary_studies, registration_summary_title } from "../../paraglide/messages.js"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import { Button, Card, CardContent, CardHeader, CardTitle, Text } from "@proxus/ui"
import {
  editRegistrationStepAction,
  registrationErrorCodeAtom,
} from "./state.js"

const problemLabels = { "understand-content": registration_problem_labels_understandContent, "prepare-exams": registration_problem_labels_prepareExams, "organize-study": registration_problem_labels_organizeStudy, "choose-studies": registration_problem_labels_chooseStudies, other: registration_problem_labels_other }
const failureMessages = { conflict: registration_failure_conflict, invalidCode: registration_failure_invalidCode, network: registration_failure_network, unexpected: registration_failure_unexpected }

export function DraftSummary({ draft }: { readonly draft: RegistrationDraft }) {
  const edit = useAtomSet(editRegistrationStepAction)
  const problem = draft.problemKind === undefined ? undefined : problemLabels[draft.problemKind]()
  return (
    <Card aria-label={registration_summary_label()} className="mt-6">
      <CardHeader><CardTitle>{registration_summary_title()}</CardTitle></CardHeader>
      <CardContent>
      <dl className="space-y-4">
        <div><dt className="text-sm font-semibold text-muted-foreground">{registration_summary_problem()}</dt>
        <dd className="flex items-center justify-between gap-4">
          {draft.problemOtherText ?? problem ?? registration_summary_pending()}
          <Button type="button" variant="ghost" onClick={() => edit("problem")}>{registration_summary_editProblem()}</Button>
        </dd></div>
        <div><dt className="text-sm font-semibold text-muted-foreground">{registration_summary_studies()}</dt>
        <dd className="flex items-center justify-between gap-4">
          {draft.path.map((node) => node.name).join(" → ") || registration_summary_pending()}
          <Button type="button" variant="ghost" onClick={() => edit("study")}>{registration_summary_editStudies()}</Button>
        </dd></div>
        <div><dt className="text-sm font-semibold text-muted-foreground">{registration_summary_profile()}</dt>
        <dd className="flex items-center justify-between gap-4">
          {draft.username === undefined ? registration_summary_pending() : `${draft.username}, ${String(draft.birthYear)}`}
          <Button type="button" variant="ghost" onClick={() => edit("profile")}>{registration_summary_editProfile()}</Button>
        </dd></div>
      </dl>
      </CardContent>
    </Card>
  )
}

export function RegistrationFailure() {
  const code = useAtomValue(registrationErrorCodeAtom)
  return code === undefined
    ? null
    : <Text role="alert">{failureMessages[code]()}</Text>
}
