import { registration_discovery_sources_ai, registration_discovery_sources_event, registration_discovery_sources_friend, registration_discovery_sources_google, registration_discovery_sources_instagram, registration_discovery_sources_other, registration_discovery_sources_tiktok, registration_discovery_sources_whatsapp, registration_discovery_continue, registration_discovery_description, registration_discovery_otherDescription, registration_discovery_otherLabel, registration_discovery_otherTitle, registration_discovery_title } from "../../../paraglide/messages.js"
import { useAtomSet } from "@effect/atom-react"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import type { AcquisitionSource } from "@proxus/shared/auth"
import { Button, ChoiceCard, Heading, Text, Textarea } from "@proxus/ui"
import { useState, type FormEvent } from "react"
import { DiscoverySourceIcon } from "./discovery-source-icon.js"
import { dispatchRegistrationAction } from "../state.js"

const sourceLabels = { friend: registration_discovery_sources_friend, tiktok: registration_discovery_sources_tiktok, instagram: registration_discovery_sources_instagram, whatsapp: registration_discovery_sources_whatsapp, google: registration_discovery_sources_google, ai: registration_discovery_sources_ai, event: registration_discovery_sources_event, other: registration_discovery_sources_other }

const sources: ReadonlyArray<AcquisitionSource> = ["friend", "tiktok", "instagram", "whatsapp", "google", "ai", "event", "other"]

export function DiscoveryStep({ draft }: { readonly draft: RegistrationDraft }) {
  const dispatch = useAtomSet(dispatchRegistrationAction)
  const [other, setOther] = useState(draft.acquisitionSource === "other")
  const [otherText, setOtherText] = useState(draft.acquisitionOtherText ?? "")
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
        <Heading level={1}>{registration_discovery_otherTitle()}</Heading>
        <Text className="-mt-4" tone="muted">{registration_discovery_otherDescription()}</Text>
        <form className="space-y-4" onSubmit={submitOther}>
          <Textarea
            aria-label={registration_discovery_otherLabel()}
            autoFocus
            className="min-h-32 bg-white"
            maxLength={200}
            required
            value={otherText}
            onChange={(event) => setOtherText(event.currentTarget.value)}
          />
          <div className="flex justify-end">
            <Button disabled={otherText.trim().length === 0} type="submit">{registration_discovery_continue()}</Button>
          </div>
        </form>
      </main>
    )
  }
  return (
    <main className="space-y-7">
      <Heading level={1}>{registration_discovery_title()}</Heading>
      <Text className="-mt-4" tone="muted">{registration_discovery_description()}</Text>
      <div className="grid gap-3 sm:grid-cols-2">
        {sources.map((source) => (
          <ChoiceCard
            className="p-4"
            key={source}
            leading={<DiscoverySourceIcon source={source} />}
            title={sourceLabels[source]()}
            onClick={() => select(source)}
          />
        ))}
      </div>
    </main>
  )
}
