import {
  expectedTargetKinds,
  stepFromPath,
  type RegistrationPath,
  type RegistrationStep,
} from "@proxus/frontend-core/registration"
import type { StudyNode } from "@proxus/shared/study-catalog"
import { Button, ChoiceCard, Heading, Skeleton, Text } from "@proxus/ui"
import { LanguageSelector, useMessagesCatalog } from "../../product-locale.js"

export type RegistrationOptionsState =
  | { readonly _tag: "Success"; readonly value: ReadonlyArray<StudyNode> }
  | { readonly _tag: "Failure" }
  | { readonly _tag: "Initial" }

interface Props {
  readonly path: RegistrationPath
  readonly options: RegistrationOptionsState
  readonly landingVariant?: "short" | "long"
  readonly onSelect: (node: StudyNode) => void
  readonly onBack: () => void
  readonly onReset: () => void
}

const icon: Record<StudyNode["kind"], string> = {
  country: "🌍", type: "📚", university: "🎓", degree: "🧭", subject: "✏️",
}

export function RegistrationWizardView({ path, options, landingVariant = "short", onSelect, onBack, onReset }: Props) {
  const m = useMessagesCatalog()
  const step = stepFromPath(path)
  const { title, description } = m.registration[step]
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
            <LanguageSelector />
            {step !== "complete" ? <Text tone="muted" className="text-sm">{m.registration.progress({ current: progress, total: 5 })}</Text> : null}
          </div>
          {step !== "complete" ? (
            <div role="progressbar" aria-valuemin={1} aria-valuemax={5} aria-valuenow={progress} className="mb-8 h-1.5 overflow-hidden rounded-full bg-muted" aria-label={m.registration.progress({ current: progress, total: 5 })}>
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress * 20}%` }} />
            </div>
          ) : null}
          <Heading level={1}>{title}</Heading>
          <Text tone="muted" className="mt-2">{description}</Text>
          {path.length === 0 && landingVariant === "long" ? <Text className="mt-4">Encuentra tu comunidad académica y personaliza tu recorrido en pocos pasos.</Text> : null}
        </header>

        <div className="flex-1">
          {step === "complete" ? (
            <div className="rounded-3xl border-2 border-primary/30 bg-card p-6 text-center shadow-sticker">
              <div className="mb-4 text-5xl" aria-hidden>🎉</div>
              <Text className="font-semibold leading-7">{path.map((node) => node.name).join(" → ")}</Text>
              <Button className="mt-7 min-h-12 w-full" onClick={onReset}>{m.registration.restart}</Button>
            </div>
          ) : options._tag === "Success" ? (
            <div className="grid gap-3">
              {nodes.map((node) => (
                <ChoiceCard key={node.id} title={node.name} leading={icon[node.kind]} onClick={() => onSelect(node)} />
              ))}
              {nodes.length === 0 ? <Text tone="muted" className="py-10 text-center">{m.registration.empty}</Text> : null}
            </div>
          ) : options._tag === "Failure" ? (
            <div role="alert" className="rounded-2xl border border-destructive/30 bg-card p-5 text-center">
              <Text>{m.errors.unavailable}</Text>
            </div>
          ) : (
            <div className="grid gap-3" aria-label={m.registration.loading}>
              <Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" />
            </div>
          )}
        </div>

        {path.length > 0 && step !== "complete" ? (
          <nav aria-label={m.registration.navigation} className="sticky bottom-0 mt-6 grid grid-cols-2 gap-3 bg-background/95 py-3 backdrop-blur">
            <Button variant="ghost" className="min-h-12" onClick={onBack}>{m.common.back}</Button>
            <Button variant="ghost" className="min-h-12" onClick={onReset}>{m.registration.homeShort}</Button>
          </nav>
        ) : null}
      </section>
    </main>
  )
}
