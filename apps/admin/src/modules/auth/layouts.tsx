import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Navigate, Outlet } from "@tanstack/react-router"
import { Cause, Option } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { createContext, useContext, useEffect } from "react"
import { AdminLayout } from "../../app/admin-layout.js"
import { AdminForbidden, adminAuthComposition } from "./admin-auth.js"

const failure = (result: { readonly cause: Cause.Cause<unknown> }) =>
  Option.getOrUndefined(Cause.findErrorOption(result.cause))

function SessionLifecycle() {
  const restore = useAtomSet(adminAuthComposition.auth.restoreSessionAtom)
  useEffect(() => { restore() }, [restore])
  return null
}

export function PublicOnlyLayout() {
  const session = useAtomValue(adminAuthComposition.auth.sessionAtom)
  return <>
    <SessionLifecycle />
    {session._tag === "Success" && session.value !== null
      ? <Navigate to="/admin/nodes" replace />
      : session._tag === "Success" ? <Outlet /> : null}
  </>
}

const PermissionsContext = createContext<ReadonlySet<string>>(new Set())
export const useAdminPermissions = () => useContext(PermissionsContext)

function AuthorizedLayout() {
  const capabilities = useAtomValue(adminAuthComposition.capabilitiesAtom)
  if (capabilities._tag !== "Success") {
    const forbidden = capabilities._tag === "Failure" && failure(capabilities) instanceof AdminForbidden
    return <main className="p-8"><h1>{forbidden ? "Acceso prohibido" : "Acceso no disponible"}</h1><p role="alert">No tienes acceso a la administración.</p></main>
  }
  const permissions = new Set(capabilities.value.permissions)
  return <PermissionsContext value={permissions}><AdminLayout><Outlet /></AdminLayout></PermissionsContext>
}

export function AuthenticatedLayout() {
  const session = useAtomValue(adminAuthComposition.auth.sessionAtom)
  return <>
    <SessionLifecycle />
    {session._tag === "Initial" || AsyncResult.isWaiting(session)
      ? <p role="status">Comprobando sesión…</p>
      : session._tag === "Failure"
        ? <p role="alert">No se pudo comprobar la sesión.</p>
        : session.value === null
          ? <Navigate to="/admin/login" replace />
          : <AuthorizedLayout />}
  </>
}
