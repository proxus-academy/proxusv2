import { useAtomSet } from "@effect/atom-react"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import type { AcquisitionSource } from "@proxus/shared/auth"
import { Button, ChoiceCard, Heading, Text, Textarea } from "@proxus/ui"
import { useState, type FormEvent } from "react"
import { DiscoverySourceIcon } from "./discovery-source-icon.js"
import { dispatchRegistrationAction } from "../state.js"

const sources: ReadonlyArray<readonly [AcquisitionSource, string]> = [
  ["friend", "Amigo o compañero"],
  ["tiktok", "TikTok"],
  ["instagram", "Instagram"],
  ["whatsapp", "WhatsApp"],
  ["google", "Google"],
  ["ai", "ChatGPT u otra IA"],
  ["event", "Evento"],
  ["other", "Otro"],
]

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
        <Heading level={1}>¿Dónde nos conociste?</Heading>
        <Text className="-mt-4" tone="muted">Cuéntanos brevemente dónde descubriste Proxus.</Text>
        <form className="space-y-4" onSubmit={submitOther}>
          <Textarea
            aria-label="Dónde conociste Proxus"
            autoFocus
            className="min-h-32 bg-white"
            maxLength={200}
            required
            value={otherText}
            onChange={(event) => setOtherText(event.currentTarget.value)}
          />
          <div className="flex justify-end">
            <Button disabled={otherText.trim().length === 0} type="submit">Continuar</Button>
          </div>
        </form>
      </main>
    )
  }
  return (
    <main className="space-y-7">
      <Heading level={1}>¿Cómo nos conociste?</Heading>
      <Text className="-mt-4" tone="muted">Tu respuesta nos ayuda a entender qué canales son más útiles.</Text>
      <div className="grid gap-3 sm:grid-cols-2">
        {sources.map(([source, label]) => (
          <ChoiceCard
            className="p-4"
            key={source}
            leading={<DiscoverySourceIcon source={source} />}
            title={label}
            onClick={() => select(source)}
          />
        ))}
      </div>
    </main>
  )
}
