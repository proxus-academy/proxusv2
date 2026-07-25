import { useAtomSet } from "@effect/atom-react"
import { composition } from "../../composition.js"
import { PasswordUpdatedView } from "./auth-public.js"

export function PasswordUpdatedPage() {
  const dispatch = useAtomSet(composition.auth.authEventAtom)
  return <PasswordUpdatedView onBackToLogin={() => dispatch({ _tag: "BackToLoginRequested" })} />
}
