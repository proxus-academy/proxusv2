import { useAtomSet } from "@effect/atom-react"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import { Button, Heading, Text, Textarea } from "@proxus/ui"
import { useState, type FormEvent } from "react"
import { problemKinds, problemLabelKeys } from "../registration-copy.js"
import { dispatchRegistrationAction, editRegistrationStepAction } from "../state.js"
import { useTranslation } from "react-i18next"

export function ProblemStep() {
  const dispatch = useAtomSet(dispatchRegistrationAction)
  const edit = useAtomSet(editRegistrationStepAction)
  const { t } = useTranslation("registration")
  return (
    <main className="space-y-7">
      <Heading level={1}>{t("problem.title")}</Heading>
      <Text className="-mt-4" tone="muted">{t("problem.description")}</Text>
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
            <span>{t(problemLabelKeys[kind])}</span>
          </button>
        ))}
      </div>
    </main>
  )
}

export function ProblemOtherStep({ draft }: { readonly draft: RegistrationDraft }) {
  const dispatch = useAtomSet(dispatchRegistrationAction)
  const [otherText, setOtherText] = useState(draft.problemOtherText ?? "")
  const { t } = useTranslation("registration", { keyPrefix: "problem" })
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    dispatch({ _tag: "ProblemSelected", kind: "other", otherText })
  }
  return (
    <main className="space-y-7">
      <Heading level={1}>{t("otherTitle")}</Heading>
      <Text className="-mt-4" tone="muted">{t("otherDescription")}</Text>
      <form className="space-y-4" onSubmit={onSubmit}>
        <Textarea
          aria-label={t("otherLabel")}
          autoFocus
          className="min-h-36 bg-white"
          maxLength={280}
          required
          value={otherText}
          onChange={(event) => setOtherText(event.currentTarget.value)}
        />
        <div className="flex items-center justify-between">
          <Text className="text-sm" tone="muted">{otherText.length}/280</Text>
          <Button disabled={otherText.trim().length === 0} type="submit">{t("continue")}</Button>
        </div>
      </form>
    </main>
  )
}
