import { AtSign, FileSignature, MapPin, UserRound } from "lucide-react"
import type { UgcWorkspace } from "@proxus/shared/ugc-management"
import { WorkspaceState } from "../workspace/workspace-state.js"

export function ProfileScreen() {
  return <WorkspaceState>{(workspace) => <CreatorProfileView workspace={workspace} />}</WorkspaceState>
}

function CreatorProfileView({ workspace }: { readonly workspace: UgcWorkspace }) {
  const user = workspace.currentUser
  if (user === null) return null
  const profile = user.data._tag === "ApplicantData" || user.data._tag === "OnboardingData" || user.data._tag === "TrialData" || user.data._tag === "CreatorData" ? user.data.profile : null
  const contract = user.data._tag === "OnboardingData" || user.data._tag === "TrialData" ? user.data.contract : null
  return <div><header><p className="text-sm font-bold text-[#793ef9]">TU CUENTA</p><h1 className="mt-2 text-3xl font-bold">Perfil</h1><p className="mt-2 text-slate-500">Datos usados para tu elegibilidad y comunicación.</p></header><div className="mt-6 grid gap-5 md:grid-cols-2"><section className="ugc-card p-5"><UserRound className="size-6 text-[#793ef9]" /><h2 className="mt-3 font-bold">Datos personales</h2><dl className="mt-4 grid gap-4 text-sm"><div><dt className="text-slate-500">Nombre</dt><dd className="font-semibold">{user.displayName}</dd></div><div><dt className="text-slate-500">Correo</dt><dd className="font-semibold">{user.email}</dd></div><div><dt className="text-slate-500">País</dt><dd className="flex items-center gap-1 font-semibold"><MapPin className="size-4" />{user.countryCode}</dd></div></dl></section><section className="ugc-card p-5"><AtSign className="size-6 text-[#793ef9]" /><h2 className="mt-3 font-bold">Cuentas de publicación</h2><dl className="mt-4 grid gap-4 text-sm"><div><dt className="text-slate-500">TikTok</dt><dd className="font-semibold">{profile?.tiktokHandle ?? "Sin registrar"}</dd></div><div><dt className="text-slate-500">Instagram</dt><dd className="font-semibold">{profile?.instagramHandle ?? "Sin registrar"}</dd></div><div><dt className="text-slate-500">Teléfono</dt><dd className="font-semibold">{profile?.phone ?? "Sin registrar"}</dd></div></dl></section>{contract === null ? null : <section className="ugc-card p-5 md:col-span-2"><FileSignature className="size-6 text-[#793ef9]" /><h2 className="mt-3 font-bold">Documento</h2><p className="mt-2 text-sm text-slate-500">{contract.documentType} · {contract.signedAt === null ? "Pendiente de firma" : "Firmado"}</p></section>}</div></div>
}
