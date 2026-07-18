import type { StudyNode } from "@proxus/shared/study-catalog"
import { Button, ChoiceCard, Heading, Skeleton, Text } from "@proxus/ui"
import { LanguageSelector, useMessagesCatalog } from "../../product-locale.js"
import { expectedTargetKinds, stepFromPath, type RegistrationPath } from "./model.js"

export type RegistrationOptionsState =
  | { readonly _tag: "Success"; readonly value: ReadonlyArray<StudyNode> }
  | { readonly _tag: "Failure" }
  | { readonly _tag: "Initial" }

export interface RegistrationWizardViewProps {
  readonly path: RegistrationPath
  readonly options: RegistrationOptionsState
  readonly onSelect: (node: StudyNode) => void
  readonly onBack: () => void
  readonly onReset: () => void
}

const nodeIcon: Record<StudyNode["kind"], string> = {
  country: "🌍",
  type: "📚",
  university: "🎓",
  degree: "🧭",
  subject: "✏️",
}

export function RegistrationWizardView({
  path,
  options,
  onSelect,
  onBack,
  onReset,
}: RegistrationWizardViewProps) {
  const m = useMessagesCatalog()
  const step = stepFromPath(path)
  const { title, description } = m.registration[step]
  const allowedKinds = expectedTargetKinds(step)
  const visibleNodes = options._tag === "Success"
    ? options.value.filter((node) => allowedKinds.includes(node.kind))
    : []

  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-5 py-10 text-foreground">
      <div aria-hidden className="absolute left-1/2 top-20 size-[32rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <section className="relative mx-auto flex min-h-[80vh] max-w-3xl flex-col justify-center">
        <header className="mb-10 text-center">
          <div className="mb-3 flex items-center justify-between"><Text className="font-bold text-primary">PROXUS</Text><LanguageSelector /></div>
          <Heading level={1}>{title}</Heading>
          <Text tone="muted" className="mt-3">{description}</Text>
        </header>

        {step === "complete" ? (
          <div className="rounded-2xl border-2 border-primary/30 bg-card p-8 text-center shadow-sticker">
            <Text className="font-semibold">{path.map((node) => node.name).join(" → ")}</Text>
            <Button className="mt-6" onClick={onReset}>{m.registration.restart}</Button>
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
              <Text tone="muted" className="col-span-full text-center">{m.registration.empty}</Text>
            ) : null}
          </div>
        ) : options._tag === "Failure" ? (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-card p-6 text-center">
            <Text>{m.errors.unavailable}</Text>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2" aria-label={m.registration.loading}>
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        )}

        {path.length > 0 && step !== "complete" ? (
          <div className="mt-8 flex justify-center gap-3">
            <Button variant="ghost" onClick={onBack}>{m.common.back}</Button>
            <Button variant="ghost" onClick={onReset}>{m.registration.home}</Button>
          </div>
        ) : null}
      </section>
    </main>
  )
}
