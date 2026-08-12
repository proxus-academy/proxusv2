import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import { Button, Card, CardContent, CardHeader, CardTitle, Text } from "@proxus/ui"
import { problemLabelKeys } from "./registration-copy.js"
import {
  editRegistrationStepAction,
  registrationErrorCodeAtom,
} from "./state.js"
import { useTranslation } from "../../platform/product-locale/paraglide-react.js"

export function DraftSummary({ draft }: { readonly draft: RegistrationDraft }) {
  const edit = useAtomSet(editRegistrationStepAction)
  const { t } = useTranslation("registration")
  const problem = draft.problemKind === undefined ? undefined : t(problemLabelKeys[draft.problemKind])
  return (
    <Card aria-label={t("summary.label")} className="mt-6">
      <CardHeader><CardTitle>{t("summary.title")}</CardTitle></CardHeader>
      <CardContent>
      <dl className="space-y-4">
        <div><dt className="text-sm font-semibold text-muted-foreground">{t("summary.problem")}</dt>
        <dd className="flex items-center justify-between gap-4">
          {draft.problemOtherText ?? problem ?? t("summary.pending")}
          <Button type="button" variant="ghost" onClick={() => edit("problem")}>{t("summary.editProblem")}</Button>
        </dd></div>
        <div><dt className="text-sm font-semibold text-muted-foreground">{t("summary.studies")}</dt>
        <dd className="flex items-center justify-between gap-4">
          {draft.path.map((node) => node.name).join(" → ") || t("summary.pending")}
          <Button type="button" variant="ghost" onClick={() => edit("study")}>{t("summary.editStudies")}</Button>
        </dd></div>
        <div><dt className="text-sm font-semibold text-muted-foreground">{t("summary.profile")}</dt>
        <dd className="flex items-center justify-between gap-4">
          {draft.username === undefined ? t("summary.pending") : `${draft.username}, ${String(draft.birthYear)}`}
          <Button type="button" variant="ghost" onClick={() => edit("profile")}>{t("summary.editProfile")}</Button>
        </dd></div>
      </dl>
      </CardContent>
    </Card>
  )
}

export function RegistrationFailure() {
  const code = useAtomValue(registrationErrorCodeAtom)
  const { t } = useTranslation("registration")
  return code === undefined
    ? null
    : <Text role="alert">{t(`failure.${code}`)}</Text>
}
