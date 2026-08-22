import { useAtomSet } from "@effect/atom-react"
import { ugcCommandAction } from "@proxus/frontend-core/ugc-management"
import {
  CompleteRequirement,
  RegisterSocialAccount,
  ReserveMeet,
  SignContract,
  SubmitApplication,
  SubmitVideo,
  type UgcCampaign,
  type UgcUser,
  type UgcWorkspace,
} from "@proxus/shared/ugc-management"
import { CalendarDays, Check, CircleAlert, Clock3, FileSignature, Sparkles, Upload, Video } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { type FormEvent, type ReactNode } from "react"
import { CommandError, useCommandWaiting } from "../workspace/command-feedback.js"
import { WorkspaceState } from "../workspace/workspace-state.js"

const dateFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" })
const date = (value: string) => dateFormatter.format(Date.parse(value))
const campaignFor = (workspace: UgcWorkspace, creatorId: string, campaignId: string) =>
  workspace.memberships.find((member) => member.creatorId === creatorId && member.status !== "removed" && workspace.groups.some((group) => group.id === member.groupId && group.campaignId === campaignId))

export function CreatorHomeScreen() {
  return <WorkspaceState>{(workspace) => workspace.role === "none" ? <ApplicationForm /> : workspace.role === "manager" ? <ManagerHome workspace={workspace} /> : <CreatorState workspace={workspace} />}</WorkspaceState>
}

function ApplicationForm() {
  const run = useAtomSet(ugcCommandAction)
  const waiting = useCommandWaiting()
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    run(new SubmitApplication({
      displayName: String(data.get("displayName")), email: String(data.get("email")), countryCode: String(data.get("countryCode")),
      tiktokHandle: String(data.get("tiktokHandle")) || null, instagramHandle: String(data.get("instagramHandle")) || null, phone: String(data.get("phone")) || null,
    }))
  }
  return <div className="mx-auto max-w-2xl">
    <header><p className="text-sm font-bold text-[#793ef9]">SOLICITUD UGC</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Cuéntanos sobre ti</h1><p className="mt-3 text-slate-500">Revisaremos tu perfil y te avisaremos cuando podamos avanzar.</p></header>
    <form className="ugc-card mt-7 grid gap-5 p-5 sm:grid-cols-2 sm:p-7" onSubmit={submit}>
      <label className="ugc-field sm:col-span-2"><span>Nombre completo</span><input name="displayName" required /></label>
      <label className="ugc-field"><span>Correo de contacto</span><input name="email" type="email" required /></label>
      <label className="ugc-field"><span>País</span><select name="countryCode" defaultValue="ES"><option value="ES">España</option><option value="MX">México</option><option value="AR">Argentina</option><option value="CO">Colombia</option><option value="CL">Chile</option><option value="PE">Perú</option></select></label>
      <label className="ugc-field"><span>TikTok</span><input name="tiktokHandle" placeholder="@usuario" /></label>
      <label className="ugc-field"><span>Instagram</span><input name="instagramHandle" placeholder="@usuario" /></label>
      <label className="ugc-field sm:col-span-2"><span>Teléfono</span><input name="phone" type="tel" /></label>
      <div className="sm:col-span-2"><CommandError /><button type="submit" className="ugc-action mt-4 w-full sm:w-auto" disabled={waiting}>Enviar solicitud</button></div>
    </form>
  </div>
}

function ManagerHome({ workspace }: { readonly workspace: UgcWorkspace }) {
  const pending = workspace.users.filter((user) => user.status === "applicant").length
  const reserved = workspace.meets.filter((meet) => meet.status === "reserved").length
  return <div><p className="text-sm font-bold text-[#793ef9]">EQUIPO UGC</p><h1 className="mt-2 text-3xl font-bold">Hola, {workspace.currentUser?.displayName}</h1><p className="mt-2 text-slate-500">Tienes {pending} solicitudes pendientes y {reserved} reuniones reservadas.</p><Link to="/ugc/manager" className="ugc-action mt-6">Abrir gestión</Link></div>
}

function CreatorState({ workspace }: { readonly workspace: UgcWorkspace }) {
  const creator = workspace.currentUser
  if (creator === null) return null
  if (creator.status === "applicant") return <Status title="Ya tenemos tu solicitud" description="Nuestro equipo está revisando tus datos. Te avisaremos cuando haya una decisión." icon={<Clock3 />} />
  if (["rejected", "disqualified", "exited"].includes(creator.status)) {
    const reason = creator.data._tag === "TerminalData" ? creator.data.reason : "No podemos continuar con el proceso."
    return <Status title={creator.status === "rejected" ? "Esta vez no podemos continuar" : creator.status === "exited" ? "Tu colaboración ha finalizado" : "El proceso ha finalizado"} description={reason} icon={<CircleAlert />} />
  }
  if (creator.status === "suspended") return <Status title="Tu cuenta está en pausa" description={creator.data._tag === "TerminalData" ? creator.data.reason : "Habla con tu manager para reactivarla."} icon={<CircleAlert />} />
  if (creator.status === "onboarding" && creator.data._tag === "OnboardingData") return <Onboarding workspace={workspace} creator={creator} />
  if (creator.status === "trial" && creator.data._tag === "TrialData") return <Trial workspace={workspace} creator={creator} />
  if (creator.status === "creator" && creator.data._tag === "CreatorData") return <CampaignHome workspace={workspace} creator={creator} />
  return <Status title="Estamos preparando tu espacio" description="Vuelve a intentarlo en unos minutos." icon={<Sparkles />} />
}

function Status({ title, description, icon }: { readonly title: string; readonly description: string; readonly icon: ReactNode }) {
  return <section className="ugc-card mx-auto max-w-2xl p-7 text-center sm:p-10"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#f0ebff] text-[#793ef9]">{icon}</span><h1 className="mt-5 text-3xl font-bold tracking-tight">{title}</h1><p className="mx-auto mt-3 max-w-lg leading-7 text-slate-500">{description}</p></section>
}

function Onboarding({ workspace, creator }: { readonly workspace: UgcWorkspace; readonly creator: UgcUser }) {
  const run = useAtomSet(ugcCommandAction)
  const waiting = useCommandWaiting()
  if (creator.data._tag !== "OnboardingData") return null
  const allComplete = creator.data.requirements.every((requirement) => requirement.completedAt !== null)
  const reserved = workspace.meets.find((meet) => meet.creatorId === creator.id && meet.status === "reserved")
  const available = workspace.meets.filter((meet) => meet.status === "available")
  const social = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(new RegisterSocialAccount({ tiktokHandle: String(data.get("tiktok")), instagramHandle: String(data.get("instagram")) || null })) }
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
    <section><p className="text-sm font-bold text-[#793ef9]">ONBOARDING</p><h1 className="mt-2 text-3xl font-bold">Prepara todo para empezar</h1><p className="mt-2 text-slate-500">Completa los pasos y reserva tu reunión de bienvenida.</p>
      <div className="ugc-card mt-6 divide-y divide-slate-100 p-5">{creator.data.requirements.map((requirement) => <div key={requirement.id} className="flex items-center gap-3 py-4 first:pt-0 last:pb-0"><span className={`grid size-7 place-items-center rounded-full ${requirement.completedAt === null ? "bg-slate-100 text-slate-400" : "bg-emerald-500 text-white"}`}>{requirement.completedAt === null ? "·" : <Check className="size-4" />}</span><span className="flex-1 font-semibold">{requirement.label}</span>{requirement.id === "training" && requirement.completedAt === null ? <button type="button" className="ugc-action ugc-action-secondary" disabled={waiting} onClick={() => run(new CompleteRequirement({ requirementId: "training" }))}>Completar</button> : null}</div>)}</div>
    </section>
    <aside className="space-y-4">
      {creator.data.contract === null ? <div className="ugc-card p-5"><FileSignature className="size-6 text-[#793ef9]" /><h2 className="mt-3 font-bold">Contrato pendiente</h2><p className="mt-1 text-sm text-slate-500">Tu manager lo generará con tus datos.</p></div> : creator.data.contract.signedAt === null ? <div className="ugc-card p-5"><h2 className="font-bold">Acuerdo listo para firmar</h2><pre className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs">{creator.data.contract.renderedDocument}</pre><button type="button" className="ugc-action mt-4 w-full" disabled={waiting} onClick={() => run(new SignContract({}))}>Firmar acuerdo</button></div> : null}
      {creator.data.requirements.find((item) => item.id === "social")?.completedAt === null ? <form className="ugc-card grid gap-3 p-5" onSubmit={social}><h2 className="font-bold">Cuenta de publicación</h2><label className="ugc-field"><span>TikTok</span><input name="tiktok" required /></label><label className="ugc-field"><span>Instagram (opcional)</span><input name="instagram" /></label><button type="submit" className="ugc-action" disabled={waiting}>Guardar cuenta</button></form> : null}
      {reserved !== undefined ? <div className="ugc-card p-5"><CalendarDays className="size-6 text-[#793ef9]" /><h2 className="mt-3 font-bold">Reunión reservada</h2><p className="mt-1 text-sm text-slate-500">{date(reserved.startsAt)} · {reserved.durationMinutes} min</p></div> : allComplete ? <div className="ugc-card p-5"><h2 className="font-bold">Elige una reunión</h2><div className="mt-3 grid gap-2">{available.length === 0 ? <p className="text-sm text-slate-500">No hay horarios disponibles ahora mismo.</p> : available.map((meet) => <button type="button" key={meet.id} className="rounded-xl border p-3 text-left text-sm font-semibold hover:border-[#793ef9]" onClick={() => run(new ReserveMeet({ meetId: meet.id }))}>{date(meet.startsAt)} · {meet.durationMinutes} min</button>)}</div></div> : null}
      <CommandError />
    </aside>
  </div>
}

function Trial({ workspace, creator }: { readonly workspace: UgcWorkspace; readonly creator: UgcUser }) {
  if (creator.data._tag !== "TrialData") return null
  const now = Date.parse(workspace.asOf)
  const submitted = workspace.videos.filter((video) => video.creatorId === creator.id && video.campaignId === null).length
  const warming = now < Date.parse(creator.data.publishingStartsAt)
  const ended = now >= Date.parse(creator.data.publishingEndsAt)
  return <div><p className="text-sm font-bold text-[#793ef9]">PERIODO DE PRUEBA</p><h1 className="mt-2 text-3xl font-bold">{warming ? "Calienta tu cuenta" : ended ? "Tu prueba está en revisión" : "Publica tus vídeos de prueba"}</h1><p className="mt-2 text-slate-500">{warming ? `Podrás empezar el ${date(creator.data.publishingStartsAt)}.` : ended ? "Tu manager revisará el resultado y te comunicará la decisión." : `${submitted} de ${creator.data.requiredVideoCount} vídeos registrados.`}</p>{!warming && !ended ? <div className="mt-6 max-w-2xl"><VideoForm campaign={null} formats={["testimonial", "review", "routine"]} /></div> : null}</div>
}

function CampaignHome({ workspace, creator }: { readonly workspace: UgcWorkspace; readonly creator: UgcUser }) {
  const assignedCampaigns = workspace.campaigns.filter((campaign) => campaignFor(workspace, creator.id, campaign.id) !== undefined && campaign.status === "published")
  const campaigns = [...assignedCampaigns].sort((left, right) => left.startsAt.localeCompare(right.startsAt))
  const now = Date.parse(workspace.asOf)
  const active = campaigns.find((campaign) => now >= Date.parse(campaign.startsAt) && now < Date.parse(campaign.reconciliationEndsAt)) ?? campaigns.find((campaign) => now < Date.parse(campaign.startsAt))
  if (active === undefined) return <Status title="Todo listo para tu próxima campaña" description="Cuando te asignemos una campaña aparecerá aquí con sus fechas, formatos y compensación." icon={<Sparkles />} />
  const membership = campaignFor(workspace, creator.id, active.id)
  if (membership === undefined) return <Status title="No encontramos tu grupo" description="Tu manager debe asignarte a un grupo antes de que puedas participar en esta campaña." icon={<CircleAlert />} />
  const tier = active.data.tiers.find((item) => item.id === membership.tierId)
  const submitted = workspace.videos.filter((video) => video.creatorId === creator.id && video.campaignId === active.id).length
  const scheduled = now < Date.parse(active.startsAt)
  const reconciliation = now >= Date.parse(active.submissionsCloseAt)
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
    <section><p className="text-sm font-bold text-[#793ef9]">{scheduled ? "PRÓXIMA CAMPAÑA" : reconciliation ? "CAMPAÑA EN REVISIÓN" : "CAMPAÑA ACTIVA"}</p><h1 className="mt-2 text-3xl font-bold">{active.name}</h1><p className="mt-2 text-slate-500">{scheduled ? `Empieza el ${date(active.startsAt)}.` : reconciliation ? `Las entregas cerraron. Revisaremos los resultados hasta el ${date(active.reconciliationEndsAt)}.` : `Puedes registrar contenido hasta el ${date(active.submissionsCloseAt)}.`}</p>
      {!scheduled && !reconciliation ? <div className="mt-6 max-w-2xl"><VideoForm campaign={active} formats={active.data.formats} /></div> : null}
    </section>
    <aside className="ugc-card h-fit p-5"><h2 className="font-bold">Resumen</h2><dl className="mt-4 grid gap-4 text-sm"><div><dt className="text-slate-500">Progreso</dt><dd className="mt-1 font-bold">{submitted} / {tier?.videoTarget ?? "—"} vídeos</dd></div><div><dt className="text-slate-500">Tier</dt><dd className="mt-1 font-bold">{tier?.label ?? membership.tierId}</dd></div><div><dt className="text-slate-500">Pago base</dt><dd className="mt-1 font-bold">{tier === undefined ? "—" : `${(tier.fixedAmountCents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}`}</dd></div><div><dt className="text-slate-500">Formatos</dt><dd className="mt-1 font-bold">{active.data.formats.join(", ")}</dd></div></dl></aside>
  </div>
}

function VideoForm({ campaign, formats }: { readonly campaign: UgcCampaign | null; readonly formats: ReadonlyArray<string> }) {
  const run = useAtomSet(ugcCommandAction)
  const waiting = useCommandWaiting()
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); run(new SubmitVideo({ campaignId: campaign?.id ?? null, format: String(data.get("format")), reference: String(data.get("reference")), tiktokUrl: String(data.get("tiktokUrl")) || null, instagramUrl: String(data.get("instagramUrl")) || null })) }
  return <form className="ugc-card grid gap-4 p-5 sm:grid-cols-2" onSubmit={submit}><div className="sm:col-span-2 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#f0ebff] text-[#793ef9]"><Upload className="size-5" /></span><div><h2 className="font-bold">Registrar vídeo</h2><p className="text-sm text-slate-500">Pega al menos uno de los enlaces publicados.</p></div></div><label className="ugc-field"><span>Formato</span><select name="format">{formats.map((format) => <option key={format}>{format}</option>)}</select></label><label className="ugc-field"><span>Referencia</span><input name="reference" required /></label><label className="ugc-field"><span>TikTok</span><input name="tiktokUrl" type="url" /></label><label className="ugc-field"><span>Instagram</span><input name="instagramUrl" type="url" /></label><div className="sm:col-span-2"><CommandError /><button type="submit" className="ugc-action mt-3" disabled={waiting}><Video className="mr-2 size-4" />Guardar vídeo</button></div></form>
}
