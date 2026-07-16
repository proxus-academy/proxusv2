import {
  expectedTargetKinds,
  stepFromPath,
  type RegistrationPath,
  type RegistrationStep,
} from "@proxus/frontend-core/registration"
import type { StudyNode } from "@proxus/shared/study-catalog"
import { Button, ChoiceCard, Heading, Skeleton, Text } from "@proxus/ui"

export type RegistrationOptionsState =
  | { readonly _tag: "Success"; readonly value: ReadonlyArray<StudyNode> }
  | { readonly _tag: "Failure" }
  | { readonly _tag: "Initial" }

interface Props {
  readonly path: RegistrationPath
  readonly options: RegistrationOptionsState
  readonly onSelect: (node: StudyNode) => void
  readonly onBack: () => void
  readonly onReset: () => void
}

const copy: Record<RegistrationStep, readonly [string, string]> = {
  country: ["¿Dónde estudias?", "Selecciona tu país para comenzar"],
  type: ["¿Qué tipo de estudios cursas?", "Elige una opción"],
  university: ["¿En qué universidad estudias?", "Selecciona tu centro"],
  degree: ["¿Qué grado estudias?", "Selecciona tu grado"],
  subject: ["¿Qué asignatura estudias?", "Ya casi hemos terminado"],
  complete: ["¡Todo listo!", "Hemos guardado tu itinerario de estudio"],
}

const icon: Record<StudyNode["kind"], string> = {
  country: "🌍", type: "📚", university: "🎓", degree: "🧭", subject: "✏️",
}

export function RegistrationWizardView({ path, options, onSelect, onBack, onReset }: Props) {
  const step = stepFromPath(path)
  const [title, description] = copy[step]
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
            {step !== "complete" ? <Text tone="muted" className="text-sm">{progress} de 5</Text> : null}
          </div>
          {step !== "complete" ? (
            <div className="mb-8 h-1.5 overflow-hidden rounded-full bg-muted" aria-label={`Paso ${progress} de 5`}>
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
              <Button className="mt-7 min-h-12 w-full" onClick={onReset}>Empezar de nuevo</Button>
            </div>
          ) : options._tag === "Success" ? (
            <div className="grid gap-3">
              {nodes.map((node) => (
                <ChoiceCard key={node.id} title={node.name} leading={node.kind === "country" && node.name === "España" ? "🇪🇸" : icon[node.kind]} onClick={() => onSelect(node)} />
              ))}
              {nodes.length === 0 ? <Text tone="muted" className="py-10 text-center">No hay opciones disponibles todavía.</Text> : null}
            </div>
          ) : options._tag === "Failure" ? (
            <div role="alert" className="rounded-2xl border border-destructive/30 bg-card p-5 text-center">
              <Text>No hemos podido cargar las opciones. Inténtalo de nuevo.</Text>
            </div>
          ) : (
            <div className="grid gap-3" aria-label="Cargando opciones">
              <Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" />
            </div>
          )}
        </div>

        {path.length > 0 && step !== "complete" ? (
          <nav aria-label="Navegación del registro" className="sticky bottom-0 mt-6 grid grid-cols-2 gap-3 bg-background/95 py-3 backdrop-blur">
            <Button variant="ghost" className="min-h-12" onClick={onBack}>Atrás</Button>
            <Button variant="ghost" className="min-h-12" onClick={onReset}>Inicio</Button>
          </nav>
        ) : null}
      </section>
    </main>
  )
}
