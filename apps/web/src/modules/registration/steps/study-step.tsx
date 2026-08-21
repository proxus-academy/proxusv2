import { registration_study_labels_country, registration_study_labels_degree, registration_study_labels_subject, registration_study_labels_type, registration_study_labels_university, registration_study_currentSelection, registration_study_loadFailed, registration_study_loadFailedDescription, registration_study_loading, registration_study_noResults, registration_study_noResultsDescription, registration_study_nonePublished, registration_study_search, registration_study_searchPlaceholder, registration_study_titles_continueFrom, registration_study_titles_country, registration_study_titles_degree, registration_study_titles_root, registration_study_titles_subject, registration_study_titles_type, registration_study_titles_university, registration_study_users } from "../../../paraglide/messages.js"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  publicStudyCatalogChildrenQuery,
  publicStudyCatalogRootsQuery,
  toStudyCatalogViewState,
  type StudyCatalogViewState,
} from "@proxus/frontend-core/study-catalog"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import type { StudyNode } from "@proxus/shared/study-catalog"
import { Breadcrumbs, ChoiceCard, EmptyState, Grid, Heading, Initials, Input, Pagination, Skeleton, Stack } from "@proxus/ui"
import { useEffect, useMemo, useState } from "react"

import { changeRegistrationStudyPathAction, dispatchRegistrationAction } from "../state.js"

const nodeLabels = { country: registration_study_labels_country, type: registration_study_labels_type, university: registration_study_labels_university, degree: registration_study_labels_degree, subject: registration_study_labels_subject }

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
    return <Grid columns={{ base: "one", md: "two" }} gap="md" label={registration_study_loading()}>{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} size="card" />)}</Grid>
  }
  if (state._tag === "Failure") return <EmptyState title={registration_study_loadFailed()} description={registration_study_loadFailedDescription()} />
  if (state.value.length === 0) return <EmptyState title={registration_study_nonePublished()} />
  return (
    <Stack gap="xl">
      <Input aria-label={registration_study_search()} value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={registration_study_searchPlaceholder()} />
      {filtered.length === 0 ? <EmptyState title={registration_study_noResults()} description={registration_study_noResultsDescription()} /> : (
      <Grid columns={{ base: "one", md: "two" }} gap="md">
      {filtered.slice((page - 1) * pageSize, page * pageSize).map((node) => (
        <ChoiceCard
          key={node.id}
          title={node.name}
          description={nodeLabels[node.kind]()}
          meta={node.userCount === undefined ? undefined : registration_study_users({ count: node.userCount })}
          leading={<Initials>{node.name.slice(0, 2).toLocaleUpperCase()}</Initials>}
          leadingVariant="plain"
          onClick={() => dispatch({ _tag: "StudyNodeSelected", node })}
        />
      ))}
      </Grid>
      )}
      {pageCount > 1 ? <Pagination align="center" page={page} pageCount={pageCount} onPageChange={setPage} /> : null}
    </Stack>
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
    ? registration_study_titles_country()
    : targetKind === "type"
    ? registration_study_titles_type()
    : targetKind === "university"
    ? registration_study_titles_university()
    : targetKind === "degree"
    ? registration_study_titles_degree()
    : targetKind === "subject"
    ? registration_study_titles_subject()
    : parent === undefined ? registration_study_titles_root() : registration_study_titles_continueFrom({ name: parent.name })
  return (
    <Stack as="main" gap="xl">
      <Heading level={1}>{title}</Heading>
      {draft.path.length === 0 ? null : (
        <Breadcrumbs label={registration_study_currentSelection()} items={draft.path.map((node) => ({ id: node.id, label: node.name }))} onSelect={(index) => changePath(draft.path.slice(0, index))} />
      )}
      <StudyOptions state={viewState} />
    </Stack>
  )
}
