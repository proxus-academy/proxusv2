import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Navigate, Outlet } from "@tanstack/react-router"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useEffect } from "react"
import { PortalShell } from "../shell/portal-shell.js"
import { ugcAuth } from "./state.js"

function SessionLifecycle() {
  const restore = useAtomSet(ugcAuth.restoreSessionAtom)
  useEffect(() => { restore() }, [restore])
  return null
}

export function PublicOnlyLayout() {
  const session = useAtomValue(ugcAuth.sessionAtom)
  return <><SessionLifecycle />{session._tag === "Success" && session.value !== null ? <Navigate to="/ugc" replace /> : session._tag === "Success" ? <Outlet /> : <Loading />}</>
}

export function AuthenticatedLayout() {
  const session = useAtomValue(ugcAuth.sessionAtom)
  return <><SessionLifecycle />{
    session._tag === "Initial" || AsyncResult.isWaiting(session) ? <Loading />
      : session._tag === "Failure" ? <main className="grid min-h-svh place-items-center p-6"><p role="alert">No se pudo comprobar tu sesión.</p></main>
        : session.value === null ? <Navigate to="/ugc/login" replace /> : <PortalShell session={session.value}><Outlet /></PortalShell>
  }</>
}

function Loading() {
  return <main className="grid min-h-svh place-items-center"><p role="status" className="text-sm text-slate-500">Preparando tu espacio UGC…</p></main>
}
