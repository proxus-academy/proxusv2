import { ExternalLink, Video } from "lucide-react"
import type { UgcWorkspace } from "@proxus/shared/ugc-management"
import { Navigate } from "@tanstack/react-router"
import { useState } from "react"
import { WorkspaceState } from "../workspace/workspace-state.js"
import { canAccessCreatorLibrary } from "./creator-access.js"

const statusLabel = { submitted: "En revisión", changes_requested: "Necesita cambios", accepted: "Aceptado", rejected: "Rechazado", locked: "Cerrado" } as const
const dateFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" })
const date = (value: string) => dateFormatter.format(Date.parse(value))

export function VideosScreen() {
  return <WorkspaceState>{(workspace) => <CreatorVideosView workspace={workspace} />}</WorkspaceState>
}

function CreatorVideosView({ workspace }: { readonly workspace: UgcWorkspace }) {
  const [filter, setFilter] = useState("all")
  if (!canAccessCreatorLibrary(workspace)) return <Navigate to="/ugc" replace />
  if (workspace.role === "manager") return <section><h1 className="text-3xl font-bold">Vídeos del equipo</h1><p className="mt-2 text-slate-500">Revisa y actualiza las métricas desde Gestión.</p></section>
  const campaigns = new Map(workspace.campaigns.map((campaign) => [campaign.id, campaign.name]))
  const videos = workspace.videos.filter((video) => filter === "all" || (filter === "trial" ? video.campaignId === null : video.campaignId !== null))
  return <div><header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-bold text-[#793ef9]">TU CONTENIDO</p><h1 className="mt-2 text-3xl font-bold">Historial de vídeos</h1><p className="mt-2 text-slate-500">Todos tus vídeos de prueba y campaña.</p></div><select aria-label="Filtrar vídeos" className="rounded-xl border bg-white px-4 py-2" value={filter} onChange={(event) => setFilter(event.currentTarget.value)}><option value="all">Todos</option><option value="campaign">Campañas</option><option value="trial">Periodo de prueba</option></select></header>
      <section className="ugc-card mt-6 overflow-hidden">{videos.length === 0 ? <div className="grid min-h-64 place-items-center p-6 text-center"><div><Video className="mx-auto size-8 text-slate-300" /><p className="mt-3 font-semibold">Todavía no hay vídeos</p></div></div> : <div className="divide-y divide-slate-100">{videos.map((video) => {
        const metrics = workspace.videoData.filter((item) => item.videoId === video.id).sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0]
        return <article key={video.id} className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold">{video.reference}</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{statusLabel[video.status]}</span></div><p className="mt-1 text-sm text-slate-500">{video.campaignId === null ? "Periodo de prueba" : campaigns.get(video.campaignId)} · {video.format} · {date(video.submittedAt)}</p>{video.reviewNotes === null ? null : <p className="mt-2 text-sm text-amber-700">{video.reviewNotes}</p>}<div className="mt-3 flex flex-wrap gap-3 text-sm">{video.tiktokUrl === null ? null : <a className="inline-flex items-center gap-1 font-semibold text-[#793ef9]" href={video.tiktokUrl} target="_blank" rel="noreferrer">Ver en TikTok <ExternalLink className="size-3" /></a>}{video.instagramUrl === null ? null : <a className="inline-flex items-center gap-1 font-semibold text-[#793ef9]" href={video.instagramUrl} target="_blank" rel="noreferrer">Ver en Instagram <ExternalLink className="size-3" /></a>}</div></div><dl className="flex gap-5 text-sm sm:text-right"><div><dt className="text-slate-500">TikTok</dt><dd className="font-bold">{(metrics?.tiktokViews ?? 0).toLocaleString("es-ES")}</dd></div><div><dt className="text-slate-500">Instagram</dt><dd className="font-bold">{(metrics?.instagramViews ?? 0).toLocaleString("es-ES")}</dd></div></dl></article>
      })}</div>}</section>
    </div>
}
