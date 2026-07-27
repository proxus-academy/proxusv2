import { useAtomValue } from "@effect/atom-react"
import { RegistrationOnboarding } from "../../modules/registration/onboarding-flow.js"
import { featureFlagSnapshotLifecycleAtom } from "../../modules/registration/feature-flags.js"
import { googleCallbackLifecycleAtom } from "../../modules/registration/state.js"

export function RegistrationPage() {
  useAtomValue(featureFlagSnapshotLifecycleAtom)
  useAtomValue(googleCallbackLifecycleAtom)
  return <RegistrationOnboarding />
}
