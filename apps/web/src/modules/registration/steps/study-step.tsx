import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  publicStudyCatalogChildrenQuery,
  publicStudyCatalogRootsQuery,
  toStudyCatalogViewState,
  type StudyCatalogViewState,
} from "@proxus/frontend-core/study-catalog"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import type { StudyNode } from "@proxus/shared/study-catalog"
import { Button, ChoiceCard, Heading, Text } from "@proxus/ui"
import {
  nodeLabels,
  previousStudyStep,
  studyStepTitles,
  type StudyStep,
} from "../registration-copy.js"
import { dispatchRegistrationAction, editRegistrationStepAction } from "../state.js"

function StudyOptions({ state }: {
  readonly state: StudyCatalogViewState<ReadonlyArray<StudyNode>>
}) {
  const dispatch = useAtomSet(dispatchRegistrationAction)
  if (state._tag === "Initial") return <Text aria-live="polite">Cargando opciones…</Text>
  if (state._tag === "Failure") return <Text role="alert">No hemos podido cargar las opciones. Inténtalo de nuevo.</Text>
  if (state.value.length === 0) return <Text>No hay opciones publicadas.</Text>
  return (
    <div>
      {state.value.map((node) => (
        <ChoiceCard
          key={node.id}
          title={node.name}
          leading={nodeLabels[node.kind]}
          onClick={() => dispatch({ _tag: "StudyNodeSelected", node })}
        />
      ))}
    </div>
  )
}

export function StudyStepPage({ draft, step }: {
  readonly draft: RegistrationDraft
  readonly step: StudyStep
}) {
  const parent = draft.path.at(-1)
  const options = useAtomValue(
    parent === undefined
      ? publicStudyCatalogRootsQuery
      : publicStudyCatalogChildrenQuery(parent.id),
  )
  const edit = useAtomSet(editRegistrationStepAction)
  return (
    <main>
      <Heading level={1}>{studyStepTitles[step]}</Heading>
      <Text>{draft.path.map((node) => node.name).join(" → ")}</Text>
      <StudyOptions state={toStudyCatalogViewState(options)} />
      <Button variant="ghost" onClick={() => edit(previousStudyStep[step])}>Volver</Button>
    </main>
  )
}
