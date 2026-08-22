import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  AdjustPayment,
  ConfigureManager,
  CreateCampaign,
  CreateGroup,
  DisableManager,
  EditMeet,
  ExitCreator,
  GeneratePayments,
  ImportGroupConfiguration,
  MarkPaymentPaid,
  PublishCampaign,
  ResumeCreator,
  SuspendCreator,
  makeUgcCampaignId,
  type UgcWorkspace,
} from "@proxus/shared/ugc-management"
import { makeAccountId } from "@proxus/shared/auth"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { Banknote, CalendarClock, Download, Megaphone, Plus, Settings2, UsersRound } from "lucide-react"
import { type FormEvent, type ReactNode, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { CampaignRulesFields } from "./campaign-rules-fields.js"
import { campaignRulesFromFormData } from "./campaign-rules.js"
import { downloadPendingPaymentsCsv, pendingPaymentsCsv } from "./payments-csv.js"
import { adminUgcCommandAction, adminUgcWorkspaceQuery } from "./state.js"
import { ProgramConfiguration } from "./program-configuration-form.js"

const iso = (value: FormDataEntryValue | null) => `${String(value)}:00.000Z`
const money = (cents: number, currency: "EUR" | "USD") => (cents / 100).toLocaleString("es-ES", { style: "currency", currency })
const adminSections = [
  { id: "program" as const, label: "Programa", icon: Settings2 },
  { id: "campaigns" as const, label: "Campañas", icon: Megaphone },
  { id: "managers" as const, label: "Managers", icon: UsersRound },
  { id: "meets" as const, label: "Reuniones", icon: CalendarClock },
  { id: "payments" as const, label: "Pagos", icon: Banknote },
]

export function UgcManagementScreen() {
  const workspace = useAtomValue(adminUgcWorkspaceQuery)
  const mutation = useAtomValue(adminUgcCommandAction)
  const [section, setSection] = useState<"program" | "campaigns" | "managers" | "meets" | "payments">("campaigns")
  if (workspace._tag === "Failure") return <main className="p-6"><Alert variant="destructive"><AlertTitle>No se pudo cargar UGC</AlertTitle><AlertDescription>Comprueba que tienes permisos de administrador.</AlertDescription></Alert></main>
  if (workspace._tag !== "Success") return <main className="p-6"><p role="status">Cargando gestión UGC…</p></main>
  return <main className="min-h-0 flex-1 overflow-auto p-4 md:p-6"><div className="mx-auto w-full max-w-[90rem] space-y-6"><header><h1 className="text-2xl font-semibold">UGC</h1><p className="text-sm text-muted-foreground">Configura el programa, campañas, equipos y liquidaciones.</p></header><nav className="flex flex-wrap gap-2">{adminSections.map(({ id, label, icon: Icon }) => <Button key={id} variant={section === id ? "default" : "outline"} onClick={() => setSection(id)}><Icon />{label}</Button>)}</nav>{mutation._tag === "Failure" ? <Alert variant="destructive"><AlertTitle>Acción no aplicada</AlertTitle><AlertDescription>Revisa el estado de la entidad y los datos introducidos.</AlertDescription></Alert> : null}{section === "program" ? <ProgramConfiguration workspace={workspace.value} /> : section === "campaigns" ? <Campaigns workspace={workspace.value} /> : section === "managers" ? <Managers workspace={workspace.value} /> : section === "meets" ? <Meets workspace={workspace.value} /> : <Payments workspace={workspace.value} />}</div></main>
}

function Grid({ children }: { readonly children: ReactNode }) { return <div className="grid gap-5 xl:grid-cols-2">{children}</div> }

function Campaigns({ workspace }: { readonly workspace: UgcWorkspace }) {
  const run = useAtomSet(adminUgcCommandAction)
  const mutation = useAtomValue(adminUgcCommandAction)
  const waiting = AsyncResult.isWaiting(mutation)
  const managers = workspace.users.filter((user) => user.userType === "manager" && user.status === "active")
  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget)
    const { tiers, bonusRules } = campaignRulesFromFormData(data)
    run(new CreateCampaign({ name: String(data.get("name")), startsAt: iso(data.get("starts")), submissionsCloseAt: iso(data.get("close")), reconciliationEndsAt: iso(data.get("reconcile")), countries: String(data.get("countries")).split(",").map((item) => item.trim().toUpperCase()), formats: String(data.get("formats")).split(",").map((item) => item.trim()), tiers, bonusRules }))
  }
  return <Grid><Card><CardHeader><CardTitle>Nueva campaña</CardTitle><CardDescription>Fechas, mercados, formatos, tiers y bonus quedan versionados en la campaña.</CardDescription></CardHeader><CardContent><form className="grid gap-4" onSubmit={create}><Input name="name" placeholder="Nombre" required /><div className="grid gap-3 sm:grid-cols-3"><Input name="starts" type="datetime-local" aria-label="Inicio" required /><Input name="close" type="datetime-local" aria-label="Cierre de entregas" required /><Input name="reconcile" type="datetime-local" aria-label="Fin de revisión" required /></div><Input name="countries" defaultValue="ES" aria-label="Países" /><Input name="formats" defaultValue="testimonial, review" aria-label="Formatos" /><CampaignRulesFields /><Button disabled={waiting}><Plus />Crear borrador</Button></form></CardContent></Card>
    <Card><CardHeader><CardTitle>Campañas</CardTitle></CardHeader><CardContent className="space-y-4">{workspace.campaigns.length === 0 ? <p className="text-sm text-muted-foreground">No hay campañas.</p> : workspace.campaigns.map((campaign) => { const groups = workspace.groups.filter((group) => group.campaignId === campaign.id); return <article key={campaign.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{campaign.name}</h3><p className="text-sm text-muted-foreground">{campaign.status} · {campaign.data.countries.join(", ")} · {groups.length} grupos</p></div>{campaign.status === "draft" && groups.length > 0 ? <Button size="sm" onClick={() => run(new PublishCampaign({ campaignId: campaign.id }))}>Publicar</Button> : null}</div>{campaign.status === "draft" ? <form className="mt-3 grid gap-2 sm:grid-cols-4" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const manager = managers.find((item) => item.id === data.get("manager")); if (manager !== undefined) run(new CreateGroup({ campaignId: campaign.id, managerId: manager.id, name: String(data.get("name")), capacity: Number(data.get("capacity")) })) }}><select aria-label="Manager del grupo" name="manager" className="rounded-md border bg-background px-3 text-sm" required>{managers.map((manager) => <option value={manager.id} key={manager.id}>{manager.displayName}</option>)}</select><Input name="name" placeholder="Nombre del grupo" required /><Input name="capacity" type="number" min="1" defaultValue="25" required /><Button variant="outline">Añadir grupo</Button></form> : null}</article> })}</CardContent></Card><ImportGroups workspace={workspace} waiting={waiting} /></Grid>
}

function ImportGroups({ workspace, waiting }: { readonly workspace: UgcWorkspace; readonly waiting: boolean }) {
  const run = useAtomSet(adminUgcCommandAction)
  const sources = workspace.campaigns.filter((campaign) => workspace.groups.some((group) => group.campaignId === campaign.id))
  const targets = workspace.campaigns.filter((campaign) => campaign.status === "draft" && !workspace.groups.some((group) => group.campaignId === campaign.id))
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    run(new ImportGroupConfiguration({ sourceCampaignId: makeUgcCampaignId(String(data.get("source"))), targetCampaignId: makeUgcCampaignId(String(data.get("target"))) }))
  }
  return <Card><CardHeader><CardTitle>Importar equipos</CardTitle><CardDescription>Copia nombres, managers y capacidades; nunca copia creadores.</CardDescription></CardHeader><CardContent><form className="grid gap-3" onSubmit={submit}><select aria-label="Campaña de origen" name="source" className="rounded-md border bg-background p-2" required>{sources.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select><select aria-label="Campaña de destino" name="target" className="rounded-md border bg-background p-2" required>{targets.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select><Button disabled={waiting || sources.length === 0 || targets.length === 0}>Importar configuración</Button></form></CardContent></Card>
}

function Managers({ workspace }: { readonly workspace: UgcWorkspace }) {
  const run = useAtomSet(adminUgcCommandAction)
  const managers = workspace.users.filter((user) => user.userType === "manager")
  const create = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(new ConfigureManager({ authUserId: makeAccountId(String(data.get("accountId"))), displayName: String(data.get("name")), email: String(data.get("email")), countryCode: String(data.get("country")).toUpperCase(), markets: String(data.get("markets")).split(",").map((item) => item.trim().toUpperCase()), acceptsMeetings: data.get("meetings") === "on" })) }
  return <Grid><Card><CardHeader><CardTitle>Configurar manager</CardTitle><CardDescription>Vincula una cuenta Proxus y limita sus mercados.</CardDescription></CardHeader><CardContent><form className="grid gap-3" onSubmit={create}><Input name="accountId" placeholder="UUID de la cuenta" required /><Input name="name" placeholder="Nombre" required /><Input name="email" type="email" placeholder="Correo" required /><div className="grid gap-3 sm:grid-cols-2"><Input name="country" defaultValue="ES" /><Input name="markets" defaultValue="ES" /></div><label className="flex items-center gap-2 text-sm"><input name="meetings" type="checkbox" defaultChecked /> Acepta reuniones</label><Button>Guardar manager</Button></form></CardContent></Card><Card><CardHeader><CardTitle>Equipo</CardTitle></CardHeader><CardContent className="space-y-3">{managers.map((manager) => <article key={manager.id} className="rounded-xl border p-4"><h3 className="font-semibold">{manager.displayName}</h3><p className="text-sm text-muted-foreground">{manager.email} · {manager.status}</p><p className="mt-1 text-xs text-muted-foreground">{manager.data._tag === "ManagerData" ? manager.data.markets.join(", ") : ""}</p>{manager.status === "active" ? <Button className="mt-3" size="sm" variant="outline" onClick={() => run(new DisableManager({ managerId: manager.id }))}>Desactivar</Button> : null}</article>)}</CardContent></Card><CreatorControls workspace={workspace} /></Grid>
}

function CreatorControls({ workspace }: { readonly workspace: UgcWorkspace }) {
  const run = useAtomSet(adminUgcCommandAction)
  const creators = workspace.users.filter((user) => user.userType === "creator" && ["creator", "suspended"].includes(user.status))
  return <Card><CardHeader><CardTitle>Estado de creadores</CardTitle><CardDescription>Pausa, reactiva o finaliza una colaboración.</CardDescription></CardHeader><CardContent className="space-y-3">{creators.map((creator) => <article key={creator.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><h3 className="font-semibold">{creator.displayName}</h3><p className="text-sm text-muted-foreground">{creator.status}</p></div><div className="flex gap-2">{creator.status === "suspended" ? <Button size="sm" onClick={() => run(new ResumeCreator({ creatorId: creator.id }))}>Reactivar</Button> : <Button size="sm" variant="outline" onClick={() => run(new SuspendCreator({ creatorId: creator.id, reason: "Pausa administrativa" }))}>Suspender</Button>}<Button size="sm" variant="destructive" onClick={() => run(new ExitCreator({ creatorId: creator.id, reason: "Colaboración finalizada por administración" }))}>Finalizar</Button></div></article>)}</CardContent></Card>
}

function Meets({ workspace }: { readonly workspace: UgcWorkspace }) {
  const run = useAtomSet(adminUgcCommandAction)
  return <Card><CardHeader><CardTitle>Reuniones</CardTitle><CardDescription>El manager crea y realiza la reunión; administración puede corregir fecha y duración.</CardDescription></CardHeader><CardContent className="space-y-3">{workspace.meets.map((meet) => <article key={meet.id} className="rounded-xl border p-4"><p className="font-semibold">{meet.startsAt} · {meet.status}</p><form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(new EditMeet({ meetId: meet.id, startsAt: iso(data.get("starts")), durationMinutes: Number(data.get("duration")) })) }}><Input className="w-auto" name="starts" type="datetime-local" required /><Input className="w-28" name="duration" type="number" defaultValue={meet.durationMinutes} required /><Button variant="outline">Editar</Button></form></article>)}</CardContent></Card>
}

function Payments({ workspace }: { readonly workspace: UgcWorkspace }) {
  const run = useAtomSet(adminUgcCommandAction)
  const pending = workspace.payments.filter((payment) => payment.status === "pending")
  const finalizedCampaigns = workspace.campaigns.filter((campaign) => campaign.status === "finalized")
  return <div className="space-y-5"><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => downloadPendingPaymentsCsv(pendingPaymentsCsv(workspace.payments, workspace.users, workspace.campaigns))}><Download />Descargar CSV pendiente</Button>{finalizedCampaigns.map((campaign) => <Button key={campaign.id} onClick={() => run(new GeneratePayments({ campaignId: campaign.id }))}>Generar pagos · {campaign.name}</Button>)}</div><Card><CardHeader><CardTitle>Liquidaciones pendientes</CardTitle></CardHeader><CardContent className="space-y-3">{pending.length === 0 ? <p className="text-sm text-muted-foreground">No hay pagos pendientes.</p> : pending.map((payment) => { const recipient = workspace.users.find((user) => user.id === payment.recipientUserId); const relatedCreator = workspace.users.find((user) => user.id === payment.relatedCreatorId); return <article key={payment.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{recipient?.displayName ?? payment.recipientUserId}</h3><p className="text-sm text-muted-foreground">{payment.kind.replaceAll("_", " ")} · {money(payment.amountCents, payment.currency)}</p>{relatedCreator === undefined || relatedCreator.id === recipient?.id ? null : <p className="text-xs text-muted-foreground">Creador relacionado: {relatedCreator.displayName}</p>}</div><Button onClick={() => run(new MarkPaymentPaid({ paymentId: payment.id }))}>Marcar pagado</Button></div><form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(new AdjustPayment({ paymentId: payment.id, amountCents: Number(data.get("amount")), reason: String(data.get("reason")) })) }}><Input className="w-36" name="amount" type="number" placeholder="Ajuste céntimos" required /><Input className="min-w-60 flex-1" name="reason" placeholder="Motivo" required /><Button variant="outline">Aplicar ajuste</Button></form></article> })}</CardContent></Card></div>
}
