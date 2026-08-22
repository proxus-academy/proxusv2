import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { CurrentSession } from "@proxus/shared/auth"
import { ugcWorkspaceQuery } from "@proxus/frontend-core/ugc-management"
import { Link, useMatchRoute, useNavigate } from "@tanstack/react-router"
import { BriefcaseBusiness, Home, LogOut, UserRound, Video, WalletCards } from "lucide-react"
import { Effect, Exit } from "effect"
import type { ReactNode } from "react"
import { ugcAuth } from "../auth/state.js"
import { canAccessCreatorLibrary, canAccessCreatorProfile } from "../creator/creator-access.js"

const baseNavigation = [
  { to: "/ugc", label: "Inicio", icon: Home },
  { to: "/ugc/videos", label: "Vídeos", icon: Video },
  { to: "/ugc/payments", label: "Pagos", icon: WalletCards },
  { to: "/ugc/profile", label: "Perfil", icon: UserRound },
] as const

export function PortalShell({ session, children }: { readonly session: CurrentSession; readonly children: ReactNode }) {
  const workspace = useAtomValue(ugcWorkspaceQuery)
  const logout = useAtomSet(ugcAuth.logoutAtom, { mode: "promiseExit" })
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const manager = workspace._tag === "Success" && workspace.value.role === "manager"
  const libraryUnlocked = workspace._tag === "Success" && canAccessCreatorLibrary(workspace.value)
  const profileUnlocked = workspace._tag === "Success" && canAccessCreatorProfile(workspace.value)
  const navigation = manager
    ? [...baseNavigation, { to: "/ugc/manager" as const, label: "Gestión", icon: BriefcaseBusiness }]
    : libraryUnlocked
      ? baseNavigation
      : profileUnlocked
        ? [baseNavigation[0], baseNavigation[3]]
        : []
  const signOut = () => Effect.runFork(Effect.promise(() => logout()).pipe(Effect.flatMap((exit) => Exit.isSuccess(exit) ? Effect.promise(() => navigate({ to: "/ugc/login", replace: true })) : Effect.void)))
  return <div className="ugc-shell">
    <header className="sticky top-0 z-30 border-b border-black/[.07] bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-6xl items-center gap-5 px-4 sm:px-6">
        <Link to="/ugc" className="shrink-0 text-base font-extrabold tracking-[.12em] text-[#793ef9]">PROXUS <span className="rounded-md bg-[#f0ebff] px-1.5 py-1 text-[10px] tracking-normal">UGC</span></Link>
        {navigation.length === 0 ? null : <nav aria-label="Principal" className="mx-auto hidden items-center rounded-full border border-black/[.08] bg-[#fafafa] p-1 md:flex">
          {navigation.map(({ to, label }) => <Link key={to} to={to} className={`rounded-full px-5 py-2 text-sm font-semibold ${matchRoute({ to, fuzzy: to !== "/ugc" }) !== false ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>{label}</Link>)}
        </nav>}
        <div className="ml-auto flex items-center gap-3"><span className="hidden max-w-44 truncate text-sm text-slate-500 sm:block">{session.account.username}</span><button type="button" onClick={signOut} className="grid size-10 place-items-center rounded-full border border-black/[.08] text-slate-500" aria-label="Cerrar sesión"><LogOut className="size-4" /></button></div>
      </div>
    </header>
    <div className="ugc-page mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-9">{children}</div>
    {navigation.length === 0 ? null : <nav aria-label="Principal móvil" className="fixed inset-x-0 bottom-0 z-30 grid border-t border-black/[.08] bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] md:hidden" style={{ gridTemplateColumns: `repeat(${navigation.length}, minmax(0, 1fr))` }}>
      {navigation.map(({ to, label, icon: Icon }) => <Link key={to} to={to} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${matchRoute({ to, fuzzy: to !== "/ugc" }) !== false ? "text-[#793ef9]" : "text-slate-500"}`}><Icon className="size-5" />{label}</Link>)}
    </nav>}
  </div>
}
