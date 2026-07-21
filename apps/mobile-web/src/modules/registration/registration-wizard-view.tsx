import {
  expectedTargetKinds,
  stepFromPath,
  type RegistrationPath,
} from "@proxus/frontend-core/registration"
import type {
  StudyCatalogViewError,
  StudyCatalogViewState,
} from "@proxus/frontend-core/study-catalog"
import type { MessagesCatalog } from "@proxus/product-messages"
import type { StudyNode } from "@proxus/shared/study-catalog"
import { Button, ChoiceCard, Heading, Skeleton, Text } from "@proxus/ui"
import { Match } from "effect"
import type { ReactNode } from "react"

type RegistrationOptionsState = StudyCatalogViewState<ReadonlyArray<StudyNode>>

type RegistrationLandingState =
  | { readonly _tag: "Success"; readonly value: { readonly variant: "short" | "long" } }
  | { readonly _tag: "Failure" }
  | { readonly _tag: "Initial" }

interface Props {
  readonly path: RegistrationPath
  readonly options: RegistrationOptionsState
  readonly landingAssignment: RegistrationLandingState
  readonly navigationFailed: boolean
  readonly messages: MessagesCatalog
  readonly languageSelector: ReactNode
  readonly onSelect: (node: StudyNode) => void
  readonly onBack: () => void
  readonly onReset: () => void
  readonly onRetryNavigation: () => void
}

const icon: Record<StudyNode["kind"], string> = {
  country: "🌍", type: "📚", university: "🎓", degree: "🧭", subject: "✏️",
}

const studyCatalogErrorMessage = (
  error: StudyCatalogViewError,
  messages: MessagesCatalog,
) => Match.value(error).pipe(
  Match.tag("StudyCatalogNotFound", () => messages.errors.studyCatalog.nodeNotFound),
  Match.tag("StudyCatalogUnavailable", () => messages.errors.unavailable),
  Match.tag("StudyCatalogUnexpected", () => messages.errors.unexpected),
  Match.exhaustive,
)

export function RegistrationWizardView({ path, options, landingAssignment, navigationFailed, messages: m, languageSelector, onSelect, onBack, onReset, onRetryNavigation }: Props) {
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
            {languageSelector}
            {step !== "complete" ? <Text tone="muted" className="text-sm">{m.registration.progress({ current: progress, total: 5 })}</Text> : null}
          </div>
          {step !== "complete" ? (
            <div role="progressbar" aria-valuemin={1} aria-valuemax={5} aria-valuenow={progress} className="mb-8 h-1.5 overflow-hidden rounded-full bg-muted" aria-label={m.registration.progress({ current: progress, total: 5 })}>
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress * 20}%` }} />
            </div>
          ) : null}
          <Heading level={1}>{title}</Heading>
          <Text tone="muted" className="mt-2">{description}</Text>
          {path.length === 0 && landingAssignment._tag === "Success" && landingAssignment.value.variant === "long" ? <Text className="mt-4">{m.registration.longDescription}</Text> : null}
          {path.length === 0 && landingAssignment._tag === "Initial" ? <Skeleton className="mt-4 h-5 w-72" aria-label={m.registration.landingLoading} /> : null}
          {path.length === 0 && landingAssignment._tag === "Failure" ? <Text role="alert" tone="muted" className="mt-4">{m.errors.unavailable}</Text> : null}
        </header>

        <div className="flex-1">
          {navigationFailed ? (
            <div role="alert" className="mb-5 rounded-2xl border border-destructive/30 bg-card p-5 text-center">
              <Text>{m.errors.unexpected}</Text>
              <Button className="mt-4 min-h-12 w-full" onClick={onRetryNavigation}>{m.common.retry}</Button>
            </div>
          ) : null}

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
              <Text>{studyCatalogErrorMessage(options.error, m)}</Text>
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
