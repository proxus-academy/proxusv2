import { useAtomSet } from "@effect/atom-react"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import type { AcquisitionSource } from "@proxus/shared/auth"
import { Button, ChoiceCard, Heading, Text, Textarea } from "@proxus/ui"
import { useState, type FormEvent } from "react"
import { DiscoverySourceIcon } from "./discovery-source-icon.js"
import { dispatchRegistrationAction } from "../state.js"
import { useTranslation } from "react-i18next"

const sources: ReadonlyArray<AcquisitionSource> = ["friend", "tiktok", "instagram", "whatsapp", "google", "ai", "event", "other"]

export function DiscoveryStep({ draft }: { readonly draft: RegistrationDraft }) {
  const dispatch = useAtomSet(dispatchRegistrationAction)
  const [other, setOther] = useState(draft.acquisitionSource === "other")
  const [otherText, setOtherText] = useState(draft.acquisitionOtherText ?? "")
  const { t } = useTranslation("registration", { keyPrefix: "discovery" })
  const select = (source: AcquisitionSource) => {
    if (source === "other") {
      setOther(true)
      return
    }
    dispatch({ _tag: "AcquisitionSelected", source })
  }
  const submitOther = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    dispatch({ _tag: "AcquisitionSelected", source: "other", otherText })
  }
  if (other) {
    return (
      <main className="space-y-7">
        <Heading level={1}>{t("otherTitle")}</Heading>
        <Text className="-mt-4" tone="muted">{t("otherDescription")}</Text>
        <form className="space-y-4" onSubmit={submitOther}>
          <Textarea
            aria-label={t("otherLabel")}
            autoFocus
            className="min-h-32 bg-white"
            maxLength={200}
            required
            value={otherText}
            onChange={(event) => setOtherText(event.currentTarget.value)}
          />
          <div className="flex justify-end">
            <Button disabled={otherText.trim().length === 0} type="submit">{t("continue")}</Button>
          </div>
        </form>
      </main>
    )
  }
  return (
    <main className="space-y-7">
      <Heading level={1}>{t("title")}</Heading>
      <Text className="-mt-4" tone="muted">{t("description")}</Text>
      <div className="grid gap-3 sm:grid-cols-2">
        {sources.map((source) => (
          <ChoiceCard
            className="p-4"
            key={source}
            leading={<DiscoverySourceIcon source={source} />}
            title={t(`sources.${source}`)}
            onClick={() => select(source)}
          />
        ))}
      </div>
    </main>
  )
}
