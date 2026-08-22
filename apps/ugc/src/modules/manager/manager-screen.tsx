import { useAtomSet } from "@effect/atom-react"
import { ugcCommandAction } from "@proxus/frontend-core/ugc-management"
import {
  AcceptApplication,
  AssignCreatorToGroup,
  CreateMeetSlot,
  CreateOutboundLead,
  EditMeet,
  EvaluateTrial,
  FinalizeCampaign,
  GenerateContract,
  RecordMeetAttendance,
  RefreshVideoMetrics,
  RejectApplication,
  ReviewVideo,
  StartTrial,
  type UgcUser,
  type UgcWorkspace,
} from "@proxus/shared/ugc-management"
import { BriefcaseBusiness, CalendarPlus, Send, UserPlus } from "lucide-react"
import { type FormEvent, type ReactNode, useState } from "react"
import { CommandError, useCommandWaiting } from "../workspace/command-feedback.js"
import { WorkspaceState } from "../workspace/workspace-state.js"

const iso = (local: FormDataEntryValue | null) => `${String(local)}:00.000Z`
const dateFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" })
const date = (value: string) => dateFormatter.format(Date.parse(value))
const managerSections = [
  { id: "pipeline" as const, label: "Pipeline" }, { id: "meetings" as const, label: "Reuniones" },
  { id: "creators" as const, label: "Creadores" }, { id: "content" as const, label: "Contenido" },
]

export function ManagerScreen() {
  return <WorkspaceState>{(workspace) => workspace.role !== "manager" ? <section className="ugc-card p-7"><h1 className="text-2xl font-bold">Acceso solo para managers</h1><p className="mt-2 text-slate-500">Tu cuenta no tiene un perfil de manager UGC activo.</p></section> : <ManagerWorkspace workspace={workspace} />}</WorkspaceState>
}

function ManagerWorkspace({ workspace }: { readonly workspace: UgcWorkspace }) {
  const [section, setSection] = useState<"pipeline" | "meetings" | "creators" | "content">("pipeline")
  return <div><header><p className="text-sm font-bold text-[#793ef9]">MANAGER UGC</p><h1 className="mt-2 text-3xl font-bold">Gestión de creadores</h1><p className="mt-2 text-slate-500">Pipeline, onboarding, grupos y revisión de contenido.</p></header>
    <nav className="mt-6 flex gap-2 overflow-auto pb-1" aria-label="Secciones de gestión">{managerSections.map((option) => <button type="button" key={option.id} onClick={() => setSection(option.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${section === option.id ? "bg-[#793ef9] text-white" : "border bg-white text-slate-600"}`}>{option.label}</button>)}</nav>
    <div className="mt-5">{section === "pipeline" ? <Pipeline workspace={workspace} /> : section === "meetings" ? <Meetings workspace={workspace} /> : section === "creators" ? <Creators workspace={workspace} /> : <Content workspace={workspace} />}</div>
  </div>
}

function Panel({ title, description, children }: { readonly title: string; readonly description?: string; readonly children: ReactNode }) {
  return <section className="ugc-card p-5"><h2 className="text-lg font-bold">{title}</h2>{description === undefined ? null : <p className="mt-1 text-sm text-slate-500">{description}</p>}<div className="mt-4">{children}</div></section>
}

function Pipeline({ workspace }: { readonly workspace: UgcWorkspace }) {
  const run = useAtomSet(ugcCommandAction)
  const waiting = useCommandWaiting()
  const leads = workspace.users.filter((user) => user.userType === "creator" && user.status === "lead")
  const applicants = workspace.users.filter((user) => user.userType === "creator" && user.status === "applicant")
  const onboarding = workspace.users.filter((user) => user.userType === "creator" && user.status === "onboarding")
  const createLead = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(new CreateOutboundLead({ displayName: String(data.get("name")), email: String(data.get("email")), countryCode: String(data.get("country")), notes: String(data.get("notes")) || null })) }
  return <div className="grid gap-5 lg:grid-cols-2"><Panel title="Añadir lead outbound" description="Solo puedes añadir países de tus mercados."><form className="grid gap-3 sm:grid-cols-2" onSubmit={createLead}><label className="ugc-field"><span>Nombre</span><input name="name" required /></label><label className="ugc-field"><span>Correo</span><input name="email" type="email" required /></label><label className="ugc-field"><span>País</span><input name="country" defaultValue="ES" maxLength={2} required /></label><label className="ugc-field"><span>Notas</span><input name="notes" /></label><button type="submit" className="ugc-action sm:col-span-2" disabled={waiting}><UserPlus className="mr-2 size-4" />Crear lead</button></form></Panel>
    <Panel title={`Solicitudes (${applicants.length})`} description={`${leads.length} leads todavía no se han registrado.`}><div className="grid gap-3">{applicants.length === 0 ? <Empty /> : applicants.map((creator) => <div key={creator.id} className="rounded-xl border p-4"><div className="flex justify-between gap-3"><div><h3 className="font-bold">{creator.displayName}</h3><p className="text-sm text-slate-500">{creator.email} · {creator.countryCode}</p></div><span className="text-xs font-semibold text-slate-400">{creator.data._tag === "ApplicantData" ? creator.data.source : ""}</span></div><div className="mt-3 flex gap-2"><button type="button" className="ugc-action" disabled={waiting} onClick={() => run(new AcceptApplication({ creatorId: creator.id }))}>Aceptar</button><button type="button" className="ugc-action ugc-action-danger" disabled={waiting} onClick={() => run(new RejectApplication({ creatorId: creator.id, reason: "Perfil no compatible en este momento" }))}>Denegar</button></div></div>)}</div></Panel>
    <div className="lg:col-span-2"><Panel title={`Onboarding (${onboarding.length})`}><div className="grid gap-4 md:grid-cols-2">{onboarding.length === 0 ? <Empty /> : onboarding.map((creator) => <OnboardingCreator key={creator.id} creator={creator} />)}</div></Panel></div><div className="lg:col-span-2"><CommandError /></div>
  </div>
}

function OnboardingCreator({ creator }: { readonly creator: UgcUser }) {
  const run = useAtomSet(ugcCommandAction)
  const waiting = useCommandWaiting()
  if (creator.data._tag !== "OnboardingData") return null
  const generate = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(new GenerateContract({ creatorId: creator.id, locale: creator.countryCode === "ES" ? "es-ES" : "es-LATAM", documentType: "DNI", documentNumber: String(data.get("document")), address: String(data.get("address")), paymentMethod: "grade" })) }
  const start = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(new StartTrial({ creatorId: creator.id, publishingStartsAt: iso(data.get("starts")), publishingEndsAt: iso(data.get("ends")), requiredVideoCount: Number(data.get("count")) })) }
  const ready = creator.data.contract?.signedAt !== null && creator.data.contract !== null && creator.data.requirements.every((item) => item.completedAt !== null)
  return <article className="rounded-xl border p-4"><h3 className="font-bold">{creator.displayName}</h3><p className="text-sm text-slate-500">{creator.email} · {creator.data.missedMeetCount} ausencias</p>{creator.data.contract === null ? <form className="mt-4 grid gap-2" onSubmit={generate}><label className="ugc-field"><span>Documento</span><input name="document" required /></label><label className="ugc-field"><span>Domicilio</span><input name="address" required /></label><button type="submit" className="ugc-action" disabled={waiting}>Generar contrato</button></form> : <p className="mt-3 text-sm font-semibold">Contrato {creator.data.contract.signedAt === null ? "pendiente de firma" : "firmado"}</p>}{ready ? <form className="mt-4 grid gap-2 sm:grid-cols-3" onSubmit={start}><label className="ugc-field"><span>Publica desde</span><input name="starts" type="datetime-local" required /></label><label className="ugc-field"><span>Hasta</span><input name="ends" type="datetime-local" required /></label><label className="ugc-field"><span>Vídeos</span><input name="count" type="number" min="1" defaultValue="8" required /></label><button type="submit" className="ugc-action sm:col-span-3" disabled={waiting}>Iniciar prueba</button></form> : null}</article>
}

function Meetings({ workspace }: { readonly workspace: UgcWorkspace }) {
  const run = useAtomSet(ugcCommandAction)
  const waiting = useCommandWaiting()
  const create = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(new CreateMeetSlot({ startsAt: iso(data.get("starts")), durationMinutes: Number(data.get("duration")) })) }
  return <div className="grid gap-5 lg:grid-cols-[20rem_1fr]"><Panel title="Nuevo horario"><form className="grid gap-3" onSubmit={create}><label className="ugc-field"><span>Fecha y hora</span><input name="starts" type="datetime-local" required /></label><label className="ugc-field"><span>Duración</span><input name="duration" type="number" min="15" defaultValue="30" required /></label><button type="submit" className="ugc-action" disabled={waiting}><CalendarPlus className="mr-2 size-4" />Publicar horario</button></form></Panel><Panel title="Agenda"><div className="grid gap-3">{workspace.meets.length === 0 ? <Empty /> : workspace.meets.map((meet) => { const creator = workspace.users.find((user) => user.id === meet.creatorId); return <article key={meet.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">{date(meet.startsAt)}</h3><p className="text-sm text-slate-500">{creator?.displayName ?? "Disponible"} · {meet.durationMinutes} min · {meet.status}</p></div>{meet.status === "reserved" ? <div className="flex gap-2"><button type="button" className="ugc-action" disabled={waiting} onClick={() => run(new RecordMeetAttendance({ meetId: meet.id, outcome: "attended", notes: null }))}>Asistió</button><button type="button" className="ugc-action ugc-action-danger" disabled={waiting} onClick={() => run(new RecordMeetAttendance({ meetId: meet.id, outcome: "missed", notes: null }))}>Faltó</button></div> : null}</div>{meet.status === "available" ? <form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(new EditMeet({ meetId: meet.id, startsAt: iso(data.get("starts")), durationMinutes: Number(data.get("duration")) })) }}><input aria-label="Nueva fecha" name="starts" type="datetime-local" required className="rounded-lg border px-3 py-2 text-sm" /><input aria-label="Nueva duración" name="duration" type="number" defaultValue={meet.durationMinutes} className="w-24 rounded-lg border px-3 py-2 text-sm" /><button type="submit" className="ugc-action ugc-action-secondary">Editar</button></form> : null}</article> })}</div></Panel><div className="lg:col-span-2"><CommandError /></div></div>
}

function Creators({ workspace }: { readonly workspace: UgcWorkspace }) {
  const run = useAtomSet(ugcCommandAction)
  const waiting = useCommandWaiting()
  const creators = workspace.users.filter((user) => user.userType === "creator" && (user.status === "creator" || user.status === "trial"))
  return <div className="grid gap-5"><Panel title="Creadores y grupos"><div className="grid gap-4">{creators.length === 0 ? <Empty /> : creators.map((creator) => <article key={creator.id} className="rounded-xl border p-4"><h3 className="font-bold">{creator.displayName}</h3><p className="text-sm text-slate-500">{creator.countryCode} · {creator.status}</p>{creator.status === "trial" ? <div className="mt-3 flex gap-2"><button type="button" className="ugc-action" disabled={waiting} onClick={() => run(new EvaluateTrial({ creatorId: creator.id, outcome: "passed", tierId: "tier-1", reason: null }))}>Supera prueba</button><button type="button" className="ugc-action ugc-action-danger" disabled={waiting} onClick={() => run(new EvaluateTrial({ creatorId: creator.id, outcome: "failed", tierId: "tier-1", reason: "No alcanza los criterios de la prueba" }))}>No supera</button></div> : <Assign creator={creator} workspace={workspace} />}</article>)}</div></Panel><CommandError /></div>
}

function Assign({ creator, workspace }: { readonly creator: UgcUser; readonly workspace: UgcWorkspace }) {
  const run = useAtomSet(ugcCommandAction)
  const waiting = useCommandWaiting()
  const assignedGroupIds = workspace.memberships.reduce((ids, member) => {
    if (member.creatorId === creator.id && member.status !== "removed") ids.add(member.groupId)
    return ids
  }, new Set<string>())
  const groups = workspace.groups.filter((group) => !assignedGroupIds.has(group.id))
  if (groups.length === 0) return <p className="mt-3 text-sm text-slate-500">No hay grupos disponibles.</p>
  return <form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const groupId = String(data.get("group")); const group = workspace.groups.find((item) => item.id === groupId); const campaign = workspace.campaigns.find((item) => item.id === group?.campaignId); const tierId = campaign?.data.tiers[0]?.id; if (group !== undefined && tierId !== undefined) run(new AssignCreatorToGroup({ creatorId: creator.id, groupId: group.id, tierId })) }}><select aria-label="Grupo" name="group" className="rounded-lg border bg-white px-3 py-2 text-sm">{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><button type="submit" className="ugc-action ugc-action-secondary" disabled={waiting}>Asignar</button></form>
}

function Content({ workspace }: { readonly workspace: UgcWorkspace }) {
  const run = useAtomSet(ugcCommandAction)
  const waiting = useCommandWaiting()
  const publishedCampaigns = workspace.campaigns.filter((campaign) => campaign.status === "published")
  return <div className="grid gap-5"><Panel title="Vídeos pendientes"><div className="grid gap-3">{workspace.videos.length === 0 ? <Empty /> : workspace.videos.map((video) => { const creator = workspace.users.find((user) => user.id === video.creatorId); return <article key={video.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-bold">{video.reference}</h3><p className="text-sm text-slate-500">{creator?.displayName} · {video.format} · {video.status}</p></div><div className="flex flex-wrap gap-2"><button type="button" className="ugc-action ugc-action-secondary" disabled={waiting} onClick={() => run(new RefreshVideoMetrics({ videoId: video.id }))}><Send className="mr-1 size-4" />Métricas</button>{video.status === "submitted" || video.status === "changes_requested" ? <><button type="button" className="ugc-action" disabled={waiting} onClick={() => run(new ReviewVideo({ videoId: video.id, outcome: "accepted", notes: null }))}>Aceptar</button><button type="button" className="ugc-action ugc-action-danger" disabled={waiting} onClick={() => run(new ReviewVideo({ videoId: video.id, outcome: "changes_requested", notes: "Revisa el contenido y vuelve a enviarlo" }))}>Cambios</button></> : null}</div></div></article>})}</div></Panel><Panel title="Cierre de campañas"><div className="flex flex-wrap gap-2">{publishedCampaigns.map((campaign) => <button type="button" key={campaign.id} className="ugc-action ugc-action-secondary" disabled={waiting} onClick={() => run(new FinalizeCampaign({ campaignId: campaign.id }))}><BriefcaseBusiness className="mr-2 size-4" />Cerrar {campaign.name}</button>)}</div></Panel><CommandError /></div>
}

function Empty() { return <p className="py-5 text-center text-sm text-slate-500">No hay elementos en este estado.</p> }
