import { useAtomValue } from "@effect/atom-react"
import { ugcCommandAction } from "@proxus/frontend-core/ugc-management"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"

export const useCommandWaiting = () => {
  const result = useAtomValue(ugcCommandAction)
  return AsyncResult.isWaiting(result)
}

export function CommandError() {
  const result = useAtomValue(ugcCommandAction)
  return result._tag === "Failure" ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">No se pudo aplicar la acción. Comprueba el estado y vuelve a intentarlo.</p> : null
}
