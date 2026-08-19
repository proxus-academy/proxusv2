import { createFileRoute, useRouterState } from "@tanstack/react-router"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Exit } from "effect"
import { useEffect, useRef } from "react"
import { RegistrationOnboarding } from "../../modules/registration/onboarding-flow.js"
import { featureFlagSnapshotLifecycleAtom } from "../../modules/registration/feature-flags.js"
import {
  resolveGoogleCallbackAction,
  registrationDraftRestoreLifecycleAtom,
} from "../../modules/registration/state.js"
import { decodeRegistrationQuery } from "../../platform/registration/wizard-url.js"

export const Route = createFileRoute("/_public/")({
  component: RegistrationPage,
})

export function RegistrationPage() {
  const searchValue = useRouterState({ select: ({ location }) => location.searchStr })
  useAtomValue(featureFlagSnapshotLifecycleAtom)
  useAtomValue(registrationDraftRestoreLifecycleAtom)
  const resolveCallback = useAtomSet(resolveGoogleCallbackAction, { mode: "promiseExit" })
  const navigate = Route.useNavigate()
  const callbackKey = useRef<string | undefined>(undefined)
  useEffect(() => {
    const search = new URLSearchParams(searchValue)
    const code = search.get("code")
    const state = search.get("state")
    if (code === null || state === null || callbackKey.current === `${code}:${state}`) return
    callbackKey.current = `${code}:${state}`
    void resolveCallback({ code, state }).then((exit) => {
      if (!Exit.isSuccess(exit)) return
      search.delete("code")
      search.delete("state")
      void navigate({
        to: exit.value === "existing" ? "/app" : "/",
        search: Object.fromEntries(search),
        replace: true,
      })
    })
  }, [navigate, resolveCallback, searchValue])
  return <RegistrationOnboarding
    url={decodeRegistrationQuery(searchValue)}
    onOpenLogin={() => {
      void navigate({ to: "/login" })
    }}
    onComplete={() => navigate({ to: "/app", replace: true })}
  />
}
