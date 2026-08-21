import { Search, ShieldCheck, UserRound } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "./alert.js"
import { Badge } from "./badge.js"
import { Button } from "./button.js"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card.js"
import { Input } from "./input.js"
import { Item, ItemContent, ItemDescription, ItemTitle } from "./item.js"
import { ScrollArea } from "./scroll-area.js"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select.js"
import { Skeleton } from "./skeleton.js"

export interface AdminUserViewModel {
  readonly id: string
  readonly username: string
  readonly email: string
  readonly status: "pending" | "active" | "disabled"
  readonly details: ReadonlyArray<{ readonly label: string; readonly value: string; readonly code?: boolean }>
}

export function AdminUsersView({ users, loading, loadError, search, status, selected, mutationError, mutationWaiting, onSearch, onStatus, onSelect, onToggleStatus }: {
  readonly users: ReadonlyArray<AdminUserViewModel>
  readonly loading: boolean
  readonly loadError: boolean
  readonly search: string
  readonly status: string
  readonly selected: AdminUserViewModel | null
  readonly mutationError: boolean
  readonly mutationWaiting: boolean
  readonly onSearch: (value: string) => void
  readonly onStatus: (value: string) => void
  readonly onSelect: (user: AdminUserViewModel) => void
  readonly onToggleStatus: () => void
}) {
  const labels = { pending: "Pendiente", active: "Activo", disabled: "Desactivado" } as const
  const next = selected?.status === "disabled" ? "active" : "disabled"
  return <main id="users" className="flex min-h-0 flex-1 p-4 md:p-6"><div className="mx-auto flex min-h-0 w-full max-w-[90rem] flex-1 flex-col gap-6">
    <header className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><UserRound className="size-5" /></span><div><h1 className="text-xl font-semibold md:text-2xl">Usuarios</h1><p className="text-sm text-muted-foreground">Consulta cuentas y controla su acceso.</p></div></header>
    <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
      <Card className="min-h-0"><CardHeader><CardTitle>Cuentas</CardTitle><CardDescription>Busca por usuario o correo.</CardDescription></CardHeader><CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar…" /></div>
        <Select value={status} onValueChange={onStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los estados</SelectItem><SelectItem value="active">Activos</SelectItem><SelectItem value="pending">Pendientes</SelectItem><SelectItem value="disabled">Desactivados</SelectItem></SelectContent></Select>
        {loadError ? <Alert variant="destructive"><AlertTitle>Sin acceso</AlertTitle><AlertDescription>Esta sección requiere rol de administrador.</AlertDescription></Alert> : loading ? <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : <ScrollArea className="min-h-0 flex-1"><div className="space-y-2 pr-3">{users.map((user) => <Item key={user.id} asChild variant={selected?.id === user.id ? "muted" : "outline"}><button onClick={() => onSelect(user)}><ItemContent><ItemTitle>{user.username}</ItemTitle><ItemDescription>{user.email}</ItemDescription></ItemContent><Badge variant="outline">{labels[user.status]}</Badge></button></Item>)}</div></ScrollArea>}
      </CardContent></Card>
      <Card className="min-h-0"><CardHeader><CardTitle>Detalle</CardTitle></CardHeader><CardContent className="overflow-auto">{selected === null ? <div className="grid min-h-80 place-items-center text-center text-muted-foreground"><div><ShieldCheck className="mx-auto mb-3 size-8" /><p>Selecciona un usuario para ver su cuenta.</p></div></div> : <div className="space-y-6"><div><h2 className="text-xl font-semibold">{selected.username}</h2><p className="text-sm text-muted-foreground">{selected.email}</p></div><dl className="grid gap-4 text-sm sm:grid-cols-2">{selected.details.map((detail) => <div key={detail.label}><dt className="text-muted-foreground">{detail.label}</dt><dd className={detail.code === true ? "break-all font-mono text-xs" : "font-medium"}>{detail.value}</dd></div>)}</dl>{mutationError ? <Alert variant="destructive"><AlertTitle>No se pudo actualizar</AlertTitle><AlertDescription>Comprueba que la cuenta esté verificada antes de activarla.</AlertDescription></Alert> : null}{selected.status !== "pending" ? <Button variant={next === "disabled" ? "destructive" : "default"} disabled={mutationWaiting} onClick={onToggleStatus}>{next === "disabled" ? "Desactivar usuario" : "Reactivar usuario"}</Button> : null}</div>}</CardContent></Card>
    </div>
  </div></main>
}
