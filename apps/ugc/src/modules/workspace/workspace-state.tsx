import { useAtomValue } from "@effect/atom-react"
import { ugcWorkspaceQuery } from "@proxus/frontend-core/ugc-management"
import type { UgcWorkspace } from "@proxus/shared/ugc-management"
import type { ReactNode } from "react"

export function WorkspaceState({ children }: { readonly children: (workspace: UgcWorkspace) => ReactNode }) {
  const result = useAtomValue(ugcWorkspaceQuery)
  if (result._tag === "Failure") return <div className="ugc-card p-6"><p role="alert" className="font-semibold text-red-700">No se pudo cargar tu espacio UGC.</p><p className="mt-1 text-sm text-slate-500">Recarga la página o vuelve a iniciar sesión.</p></div>
  if (result._tag !== "Success") return <div className="grid min-h-72 place-items-center"><p role="status" className="text-sm text-slate-500">Cargando tu información…</p></div>
  return children(result.value)
}
