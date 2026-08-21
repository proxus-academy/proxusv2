import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { AdminApi } from "@proxus/shared/admin-api"
import type { AdminUser } from "@proxus/shared/admin-users"
import { AdminUsersView, type AdminUserViewModel } from "@proxus/ui/admin"
import { Context, Effect, Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { FetchHttpClient } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"
import { useState } from "react"

type Client = HttpApiClient.ForApi<typeof AdminApi>
class AdminUsersClient extends Context.Service<AdminUsersClient, Client["adminUsers"]>()("@proxus/admin/modules/users/users/AdminUsersClient") {}
const clientLayer = Layer.effect(AdminUsersClient, Effect.gen(function*() {
  const client = yield* HttpApiClient.make(AdminApi, { baseUrl: "/admin-api" })
  return client.adminUsers
})).pipe(Layer.provide(FetchHttpClient.layer))
const runtime = Atom.runtime(clientLayer)
const usersAtom = runtime.atom(Effect.flatMap(AdminUsersClient, (client) => client.listUsers()))
const statusMutation = Atom.family((userId: AdminUser["id"]) => runtime.fn(
  Effect.fnUntraced(function*(status: "active" | "disabled", get) {
    const client = yield* AdminUsersClient
    const user = yield* client.updateStatus({ params: { userId }, payload: { status } })
    get.refresh(usersAtom)
    return user
  }),
))

const toViewModel = (user: AdminUser): AdminUserViewModel => ({
  id: user.id,
  username: user.username,
  email: user.email,
  status: user.status,
  details: [
    { label: "Estado", value: user.status },
    { label: "Acceso", value: user.provider },
    { label: "Correo verificado", value: user.emailVerified ? "Sí" : "No" },
    { label: "Año de nacimiento", value: String(user.birthYear) },
    { label: "Estudio", value: user.studyId, code: true },
    { label: "Asignatura", value: user.subjectId, code: true },
    { label: "Problema", value: user.problemKind },
    { label: "Origen", value: user.acquisitionSource },
  ],
})

function SelectedUsersView({ users, selected, loading, loadError, search, status, onSearch, onStatus, onSelect }: {
  readonly users: ReadonlyArray<AdminUserViewModel>
  readonly selected: AdminUser
  readonly loading: boolean
  readonly loadError: boolean
  readonly search: string
  readonly status: string
  readonly onSearch: (value: string) => void
  readonly onStatus: (value: string) => void
  readonly onSelect: (user: AdminUserViewModel) => void
}) {
  const mutate = useAtomSet(statusMutation(selected.id))
  const mutation = useAtomValue(statusMutation(selected.id))
  const next = selected.status === "disabled" ? "active" : "disabled"
  return <AdminUsersView users={users} selected={toViewModel(selected)} loading={loading} loadError={loadError} search={search} status={status} mutationError={mutation._tag === "Failure"} mutationWaiting={AsyncResult.isWaiting(mutation)} onSearch={onSearch} onStatus={onStatus} onSelect={onSelect} onToggleStatus={() => mutate(next)} />
}

export function UsersScreen() {
  const users = useAtomValue(usersAtom)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const visible = users._tag === "Success" ? users.value.filter((user) => {
    const query = search.trim().toLocaleLowerCase("es")
    return (status === "all" || user.status === status) && (query === "" || `${user.username} ${user.email}`.toLocaleLowerCase("es").includes(query))
  }) : []
  const selected = users._tag === "Success" && selectedId !== null ? users.value.find((user) => user.id === selectedId) ?? null : null
  const common = {
    users: visible.map(toViewModel),
    loading: users._tag !== "Success" && users._tag !== "Failure",
    loadError: users._tag === "Failure",
    search,
    status,
    onSearch: setSearch,
    onStatus: setStatus,
    onSelect: (user: AdminUserViewModel) => setSelectedId(user.id),
  }
  return selected === null
    ? <AdminUsersView {...common} selected={null} mutationError={false} mutationWaiting={false} onToggleStatus={() => undefined} />
    : <SelectedUsersView {...common} selected={selected} />
}
