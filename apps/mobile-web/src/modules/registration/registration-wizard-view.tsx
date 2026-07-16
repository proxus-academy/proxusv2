import {
  expectedTargetKinds,
  stepFromPath,
  type RegistrationPath,
  type RegistrationStep,
} from "@proxus/frontend-core/registration"
import * as m from "@proxus/product-i18n/messages"
import type { Locale } from "@proxus/product-i18n/runtime"
import type { StudyNode } from "@proxus/shared/study-catalog"
import { Button, ChoiceCard, Heading, Skeleton, Text } from "@proxus/ui"
import { LanguageSelector } from "../../i18n.js"

export type RegistrationOptionsState =
  | { readonly _tag: "Success"; readonly value: ReadonlyArray<StudyNode> }
  | { readonly _tag: "Failure" }
  | { readonly _tag: "Initial" }

interface Props {
  readonly locale: Locale
  readonly path: RegistrationPath
  readonly options: RegistrationOptionsState
  readonly onSelect: (node: StudyNode) => void
  readonly onBack: () => void
  readonly onReset: () => void
}

const copy = (locale: Locale): Record<RegistrationStep, readonly [string, string]> => ({
  country: [m.registration_country_title({}, { locale }), m.registration_country_description({}, { locale })],
  type: [m.registration_type_title({}, { locale }), m.registration_type_description({}, { locale })],
  university: [m.registration_university_title({}, { locale }), m.registration_university_description({}, { locale })],
  degree: [m.registration_degree_title({}, { locale }), m.registration_degree_description({}, { locale })],
  subject: [m.registration_subject_title({}, { locale }), m.registration_subject_description({}, { locale })],
  complete: [m.registration_complete_title({}, { locale }), m.registration_complete_description({}, { locale })],
})

const icon: Record<StudyNode["kind"], string> = {
  country: "🌍", type: "📚", university: "🎓", degree: "🧭", subject: "✏️",
}

export function RegistrationWizardView({ locale, path, options, onSelect, onBack, onReset }: Props) {
  const step = stepFromPath(path)
  const [title, description] = copy(locale)[step]
  const nodes = options._tag === "Success"
    ? options.value.filter((node) => expectedTargetKinds(step).includes(node.kind))
    : []
  const progress = Math.min(path.length + 1, 5)

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <section className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
        <header className="mb-7">
          <div className="mb-7 flex items-center justify-between">
            <Text className="font-bold tracking-widest text-primary">PROXUS</Text>
            <LanguageSelector locale={locale} />
            {step !== "complete" ? <Text tone="muted" className="text-sm">{m.registration_progress({ current: progress, total: 5 }, { locale })}</Text> : null}
          </div>
          {step !== "complete" ? (
            <div role="progressbar" aria-valuemin={1} aria-valuemax={5} aria-valuenow={progress} className="mb-8 h-1.5 overflow-hidden rounded-full bg-muted" aria-label={m.registration_progress({ current: progress, total: 5 }, { locale })}>
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress * 20}%` }} />
            </div>
          ) : null}
          <Heading level={1}>{title}</Heading>
          <Text tone="muted" className="mt-2">{description}</Text>
        </header>

        <div className="flex-1">
          {step === "complete" ? (
            <div className="rounded-3xl border-2 border-primary/30 bg-card p-6 text-center shadow-sticker">
              <div className="mb-4 text-5xl" aria-hidden>🎉</div>
              <Text className="font-semibold leading-7">{path.map((node) => node.name).join(" → ")}</Text>
              <Button className="mt-7 min-h-12 w-full" onClick={onReset}>{m.registration_restart({}, { locale })}</Button>
            </div>
          ) : options._tag === "Success" ? (
            <div className="grid gap-3">
              {nodes.map((node) => (
                <ChoiceCard key={node.id} title={node.name} leading={icon[node.kind]} onClick={() => onSelect(node)} />
              ))}
              {nodes.length === 0 ? <Text tone="muted" className="py-10 text-center">{m.registration_empty({}, { locale })}</Text> : null}
            </div>
          ) : options._tag === "Failure" ? (
            <div role="alert" className="rounded-2xl border border-destructive/30 bg-card p-5 text-center">
              <Text>{m.registration_failure({}, { locale })}</Text>
            </div>
          ) : (
            <div className="grid gap-3" aria-label={m.registration_loading({}, { locale })}>
              <Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" />
            </div>
          )}
        </div>

        {path.length > 0 && step !== "complete" ? (
          <nav aria-label={m.registration_navigation({}, { locale })} className="sticky bottom-0 mt-6 grid grid-cols-2 gap-3 bg-background/95 py-3 backdrop-blur">
            <Button variant="ghost" className="min-h-12" onClick={onBack}>{m.registration_back({}, { locale })}</Button>
            <Button variant="ghost" className="min-h-12" onClick={onReset}>{m.registration_home_short({}, { locale })}</Button>
          </nav>
        ) : null}
      </section>
    </main>
  )
}
