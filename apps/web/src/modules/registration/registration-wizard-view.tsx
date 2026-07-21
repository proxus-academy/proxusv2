import type {
  StudyCatalogViewError,
  StudyCatalogViewState,
} from "@proxus/frontend-core/study-catalog"
import type { MessagesCatalog } from "@proxus/product-messages"
import type { StudyNode } from "@proxus/shared/study-catalog"
import { Button, ChoiceCard, Heading, Skeleton, Text } from "@proxus/ui"
import { Match } from "effect"
import type { ReactNode } from "react"
import { expectedTargetKinds, stepFromPath, type RegistrationPath } from "./model.js"

export type RegistrationOptionsState = StudyCatalogViewState<ReadonlyArray<StudyNode>>

type RegistrationLandingState =
  | { readonly _tag: "Success"; readonly value: { readonly variant: "short" | "long" } }
  | { readonly _tag: "Failure" }
  | { readonly _tag: "Initial" }

export interface RegistrationWizardViewProps {
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

const nodeIcon: Record<StudyNode["kind"], string> = {
  country: "🌍",
  type: "📚",
  university: "🎓",
  degree: "🧭",
  subject: "✏️",
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

export function RegistrationWizardView({
  path,
  options,
  landingAssignment,
  navigationFailed,
  messages: m,
  languageSelector,
  onSelect,
  onBack,
  onReset,
  onRetryNavigation,
}: RegistrationWizardViewProps) {
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
          <div className="mb-3 flex items-center justify-between"><Text className="font-bold text-primary">PROXUS</Text>{languageSelector}</div>
          <Heading level={1}>{title}</Heading>
          <Text tone="muted" className="mt-3">{description}</Text>
          {path.length === 0 && landingAssignment._tag === "Success" && landingAssignment.value.variant === "long" ? <Text className="mx-auto mt-4 max-w-xl">{m.registration.longDescription}</Text> : null}
          {path.length === 0 && landingAssignment._tag === "Initial" ? <Skeleton className="mx-auto mt-4 h-5 w-72" aria-label={m.registration.landingLoading} /> : null}
          {path.length === 0 && landingAssignment._tag === "Failure" ? <Text role="alert" tone="muted" className="mt-4">{m.errors.unavailable}</Text> : null}
        </header>

        {navigationFailed ? (
          <div role="alert" className="mb-6 rounded-xl border border-destructive/30 bg-card p-6 text-center">
            <Text>{m.errors.unexpected}</Text>
            <Button className="mt-4" onClick={onRetryNavigation}>{m.common.retry}</Button>
          </div>
        ) : null}

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
            <Text>{studyCatalogErrorMessage(options.error, m)}</Text>
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
