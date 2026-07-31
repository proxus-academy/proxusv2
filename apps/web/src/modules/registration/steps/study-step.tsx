import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  publicStudyCatalogChildrenQuery,
  publicStudyCatalogRootsQuery,
  toStudyCatalogViewState,
  type StudyCatalogViewState,
} from "@proxus/frontend-core/study-catalog"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import type { StudyNode } from "@proxus/shared/study-catalog"
import { ChoiceCard, EmptyState, Heading, Input, Pagination, Skeleton } from "@proxus/ui"
import { useEffect, useMemo, useState } from "react"
import {
  nodeLabels,
} from "../registration-copy.js"
import { changeRegistrationStudyPathAction, dispatchRegistrationAction } from "../state.js"

function StudyOptions({ state }: {
  readonly state: StudyCatalogViewState<ReadonlyArray<StudyNode>>
}) {
  const dispatch = useAtomSet(dispatchRegistrationAction)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const pageSize = 12
  const filtered = useMemo(() => state._tag === "Success"
    ? state.value.filter((node) => node.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    : [], [query, state])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  useEffect(() => setPage(1), [query])
  if (state._tag === "Initial") {
    return <div className="grid gap-3 sm:grid-cols-2" aria-label="Cargando opciones">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-24 rounded-2xl" />)}</div>
  }
  if (state._tag === "Failure") return <EmptyState title="No hemos podido cargar las opciones" description="Comprueba tu conexión e inténtalo de nuevo." />
  if (state.value.length === 0) return <EmptyState title="No hay opciones publicadas" />
  return (
    <div className="space-y-5">
      <label className="relative block">
        <span className="sr-only">Buscar opciones</span>
        <Input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Buscar…" />
      </label>
      {filtered.length === 0 ? <EmptyState title="No hay resultados" description="Prueba con otro término de búsqueda." /> : (
      <div className="grid gap-3 sm:grid-cols-2">
      {filtered.slice((page - 1) * pageSize, page * pageSize).map((node) => (
        <ChoiceCard
          key={node.id}
          title={node.name}
          description={nodeLabels[node.kind]}
          meta={node.userCount === undefined ? undefined : `${new Intl.NumberFormat("es-ES").format(node.userCount)} usuarios`}
          leading={<span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 font-bold text-primary">{node.name.slice(0, 2).toLocaleUpperCase()}</span>}
          leadingVariant="plain"
          onClick={() => dispatch({ _tag: "StudyNodeSelected", node })}
        />
      ))}
      </div>
      )}
      {pageCount > 1 ? <Pagination className="justify-center" page={page} pageCount={pageCount} onPageChange={setPage} /> : null}
    </div>
  )
}

export function StudyStepPage({ draft }: {
  readonly draft: RegistrationDraft
}) {
  const parent = draft.path.at(-1)
  const options = useAtomValue(
    parent === undefined
      ? publicStudyCatalogRootsQuery
      : publicStudyCatalogChildrenQuery(parent.id),
  )
  const changePath = useAtomSet(changeRegistrationStudyPathAction)
  const viewState = toStudyCatalogViewState(options)
  const targetKind = viewState._tag === "Success"
    ? viewState.value.at(0)?.kind
    : undefined
  const title = targetKind === "country"
    ? "¿Dónde estudias?"
    : targetKind === "type"
    ? "Elige el tipo de estudio"
    : targetKind === "university"
    ? "Elige tu universidad"
    : targetKind === "degree"
    ? "Elige tus estudios"
    : targetKind === "subject"
    ? "Elige una asignatura"
    : parent === undefined ? "¿Qué estudias?" : `Continúa desde ${parent.name}`
  return (
    <main className="space-y-6">
      <Heading level={1}>{title}</Heading>
      {draft.path.length === 0 ? null : (
        <nav aria-label="Selección actual" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {draft.path.map((node, index) => (
            <span className="inline-flex items-center gap-2" key={node.id}>
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              <button
                className="rounded px-1 py-1 font-medium hover:bg-accent hover:text-foreground"
                type="button"
                onClick={() => changePath(draft.path.slice(0, index))}
              >
                {node.name}
              </button>
            </span>
          ))}
        </nav>
      )}
      <StudyOptions state={viewState} />
    </main>
  )
}
