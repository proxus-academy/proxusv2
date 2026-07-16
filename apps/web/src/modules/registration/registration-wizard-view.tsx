import * as m from "@proxus/product-i18n/messages"
import type { Locale } from "@proxus/product-i18n/runtime"
import type { StudyNode } from "@proxus/shared/study-catalog"
import { Button, ChoiceCard, Heading, Skeleton, Text } from "@proxus/ui"
import { LanguageSelector } from "../../i18n.js"
import { expectedTargetKinds, stepFromPath, type RegistrationPath } from "./model.js"

export type RegistrationOptionsState =
  | { readonly _tag: "Success"; readonly value: ReadonlyArray<StudyNode> }
  | { readonly _tag: "Failure" }
  | { readonly _tag: "Initial" }

export interface RegistrationWizardViewProps {
  readonly locale: Locale
  readonly path: RegistrationPath
  readonly options: RegistrationOptionsState
  readonly onSelect: (node: StudyNode) => void
  readonly onBack: () => void
  readonly onReset: () => void
}

const stepCopy = (locale: Locale) => ({
  country: [m.registration_country_title({}, { locale }), m.registration_country_description({}, { locale })],
  type: [m.registration_type_title({}, { locale }), m.registration_type_description({}, { locale })],
  university: [m.registration_university_title({}, { locale }), m.registration_university_description({}, { locale })],
  degree: [m.registration_degree_title({}, { locale }), m.registration_degree_description({}, { locale })],
  subject: [m.registration_subject_title({}, { locale }), m.registration_subject_description({}, { locale })],
  complete: [m.registration_complete_title({}, { locale }), m.registration_complete_description({}, { locale })],
} as const)

const nodeIcon: Record<StudyNode["kind"], string> = {
  country: "🌍",
  type: "📚",
  university: "🎓",
  degree: "🧭",
  subject: "✏️",
}

export function RegistrationWizardView({
  locale,
  path,
  options,
  onSelect,
  onBack,
  onReset,
}: RegistrationWizardViewProps) {
  const step = stepFromPath(path)
  const [title, description] = stepCopy(locale)[step]
  const allowedKinds = expectedTargetKinds(step)
  const visibleNodes = options._tag === "Success"
    ? options.value.filter((node) => allowedKinds.includes(node.kind))
    : []

  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-5 py-10 text-foreground">
      <div aria-hidden className="absolute left-1/2 top-20 size-[32rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <section className="relative mx-auto flex min-h-[80vh] max-w-3xl flex-col justify-center">
        <header className="mb-10 text-center">
          <div className="mb-3 flex items-center justify-between"><Text className="font-bold text-primary">PROXUS</Text><LanguageSelector locale={locale} /></div>
          <Heading level={1}>{title}</Heading>
          <Text tone="muted" className="mt-3">{description}</Text>
        </header>

        {step === "complete" ? (
          <div className="rounded-2xl border-2 border-primary/30 bg-card p-8 text-center shadow-sticker">
            <Text className="font-semibold">{path.map((node) => node.name).join(" → ")}</Text>
            <Button className="mt-6" onClick={onReset}>{m.registration_restart({}, { locale })}</Button>
          </div>
        ) : options._tag === "Success" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {visibleNodes.map((node) => (
              <ChoiceCard
                key={node.id}
                title={node.name}
                leading={nodeIcon[node.kind]}
                onClick={() => onSelect(node)}
              />
            ))}
            {visibleNodes.length === 0 ? (
              <Text tone="muted" className="col-span-full text-center">{m.registration_empty({}, { locale })}</Text>
            ) : null}
          </div>
        ) : options._tag === "Failure" ? (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-card p-6 text-center">
            <Text>{m.registration_failure({}, { locale })}</Text>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2" aria-label={m.registration_loading({}, { locale })}>
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        )}

        {path.length > 0 && step !== "complete" ? (
          <div className="mt-8 flex justify-center gap-3">
            <Button variant="ghost" onClick={onBack}>{m.registration_back({}, { locale })}</Button>
            <Button variant="ghost" onClick={onReset}>{m.registration_home({}, { locale })}</Button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
