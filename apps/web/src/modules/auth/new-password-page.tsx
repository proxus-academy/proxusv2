import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { composition } from "../../composition.js"
import { NewPasswordView } from "./auth-public.js"

export function NewPasswordPage() {
  const result = useAtomValue(composition.auth.authEventAtom)
  const dispatch = useAtomSet(composition.auth.authEventAtom)
  return <NewPasswordView
    busy={result.waiting}
    error={result._tag === "Failure"}
    onSubmit={(password) => dispatch({ _tag: "PasswordSubmitted", password })}
    onBackToLogin={() => dispatch({ _tag: "BackToLoginRequested" })}
  />
}
