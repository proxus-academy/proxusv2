import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { composition } from "../../composition.js"
import { ForgotPasswordView } from "./auth-public.js"

export function PasswordRecoveryPage() {
  const recovery = useAtomValue(composition.recovery.stateAtom)
  const result = useAtomValue(composition.auth.authEventAtom)
  const dispatch = useAtomSet(composition.auth.authEventAtom)
  return <ForgotPasswordView
    email={recovery.email}
    busy={result.waiting}
    error={result._tag === "Failure"}
    onSubmit={(email) => dispatch({ _tag: "RecoverySubmitted", email })}
    onBackToLogin={() => dispatch({ _tag: "BackToLoginRequested" })}
  />
}
