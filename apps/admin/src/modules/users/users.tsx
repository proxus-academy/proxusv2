import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { AdminApi } from "@proxus/shared/admin-api"
import type { AdminUser } from "@proxus/shared/admin-users"
import { Context, Effect, Layer } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { FetchHttpClient } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"
import { Search, ShieldCheck, UserRound } from "lucide-react"
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

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

const statusLabel = { pending: "Pendiente", active: "Activo", disabled: "Desactivado" } as const

function UserDetail({ user }: { readonly user: AdminUser }) {
  const mutate = useAtomSet(statusMutation(user.id))
  const mutation = useAtomValue(statusMutation(user.id))
  const next = user.status === "disabled" ? "active" : "disabled"
  return <div className="space-y-6">
    <div>
      <h2 className="text-xl font-semibold">{user.username}</h2>
      <p className="text-sm text-muted-foreground">{user.email}</p>
    </div>
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <div><dt className="text-muted-foreground">Estado</dt><dd className="font-medium">{statusLabel[user.status]}</dd></div>
      <div><dt className="text-muted-foreground">Acceso</dt><dd className="font-medium">{user.provider}</dd></div>
      <div><dt className="text-muted-foreground">Correo verificado</dt><dd className="font-medium">{user.emailVerified ? "Sí" : "No"}</dd></div>
      <div><dt className="text-muted-foreground">Año de nacimiento</dt><dd className="font-medium">{user.birthYear}</dd></div>
      <div><dt className="text-muted-foreground">Estudio</dt><dd className="break-all font-mono text-xs">{user.studyId}</dd></div>
      <div><dt className="text-muted-foreground">Asignatura</dt><dd className="break-all font-mono text-xs">{user.subjectId}</dd></div>
      <div><dt className="text-muted-foreground">Problema</dt><dd className="font-medium">{user.problemKind}</dd></div>
      <div><dt className="text-muted-foreground">Origen</dt><dd className="font-medium">{user.acquisitionSource}</dd></div>
    </dl>
    {mutation._tag === "Failure" ? <Alert variant="destructive"><AlertTitle>No se pudo actualizar</AlertTitle><AlertDescription>Comprueba que la cuenta esté verificada antes de activarla.</AlertDescription></Alert> : null}
    {user.status !== "pending" ? <Button variant={next === "disabled" ? "destructive" : "default"} disabled={AsyncResult.isWaiting(mutation)} onClick={() => mutate(next)}>
      {next === "disabled" ? "Desactivar usuario" : "Reactivar usuario"}
    </Button> : null}
  </div>
}

export function UsersScreen() {
  const users = useAtomValue(usersAtom)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [selected, setSelected] = useState<AdminUser | null>(null)
  const visible = users._tag === "Success" ? users.value.filter((user) => {
    const query = search.trim().toLocaleLowerCase("es")
    return (status === "all" || user.status === status) && (query === "" || `${user.username} ${user.email}`.toLocaleLowerCase("es").includes(query))
  }) : []
  return <main id="users" className="flex min-h-0 flex-1 p-4 md:p-6">
    <div className="mx-auto flex min-h-0 w-full max-w-[90rem] flex-1 flex-col gap-6">
      <header className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><UserRound className="size-5" /></span><div><h1 className="text-xl font-semibold md:text-2xl">Usuarios</h1><p className="text-sm text-muted-foreground">Consulta cuentas y controla su acceso.</p></div></header>
      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <Card className="min-h-0"><CardHeader><CardTitle>Cuentas</CardTitle><CardDescription>Busca por usuario o correo.</CardDescription></CardHeader><CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar…" /></div>
          <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los estados</SelectItem><SelectItem value="active">Activos</SelectItem><SelectItem value="pending">Pendientes</SelectItem><SelectItem value="disabled">Desactivados</SelectItem></SelectContent></Select>
          {users._tag === "Failure" ? <Alert variant="destructive"><AlertTitle>Sin acceso</AlertTitle><AlertDescription>Esta sección requiere rol de administrador.</AlertDescription></Alert> : users._tag !== "Success" ? <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : <ScrollArea className="min-h-0 flex-1"><div className="space-y-2 pr-3">{visible.map((user) => <Item key={user.id} asChild variant={selected?.id === user.id ? "muted" : "outline"}><button onClick={() => setSelected(user)}><ItemContent><ItemTitle>{user.username}</ItemTitle><ItemDescription>{user.email}</ItemDescription></ItemContent><Badge variant="outline">{statusLabel[user.status]}</Badge></button></Item>)}</div></ScrollArea>}
        </CardContent></Card>
        <Card className="min-h-0"><CardHeader><CardTitle>Detalle</CardTitle></CardHeader><CardContent className="overflow-auto">{selected === null ? <div className="grid min-h-80 place-items-center text-center text-muted-foreground"><div><ShieldCheck className="mx-auto mb-3 size-8" /><p>Selecciona un usuario para ver su cuenta.</p></div></div> : <UserDetail user={visible.find((user) => user.id === selected.id) ?? selected} />}</CardContent></Card>
      </div>
    </div>
  </main>
}
