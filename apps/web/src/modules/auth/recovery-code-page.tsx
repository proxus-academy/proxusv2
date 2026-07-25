import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { composition } from "../../composition.js"
import { CodeView } from "./auth-public.js"

export function RecoveryCodePage() {
  const recovery = useAtomValue(composition.recovery.stateAtom)
  const result = useAtomValue(composition.auth.authEventAtom)
  const dispatch = useAtomSet(composition.auth.authEventAtom)
  useAtomValue(composition.auth.recoveryCooldownLifecycleAtom)
  return <CodeView
    email={recovery.email}
    busy={result.waiting}
    error={result._tag === "Failure"}
    {...("cooldownSeconds" in recovery ? { cooldownSeconds: recovery.cooldownSeconds } : {})}
    onCode={(code) => dispatch({ _tag: "CodeSubmitted", code })}
    onResend={() => dispatch({ _tag: "ResendRequested" })}
    onBackToLogin={() => dispatch({ _tag: "BackToLoginRequested" })}
  />
}
