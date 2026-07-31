import { useAtomValue } from "@effect/atom-react"
import { RegistrationOnboarding } from "../../modules/registration/onboarding-flow.js"
import { featureFlagSnapshotLifecycleAtom } from "../../modules/registration/feature-flags.js"
import {
  googleCallbackLifecycleAtom,
  registrationDraftRestoreLifecycleAtom,
} from "../../modules/registration/state.js"
import { decodeRegistrationQuery } from "../../platform/registration/wizard-url.js"

export function RegistrationPage({ searchValue }: { readonly searchValue: string }) {
  useAtomValue(featureFlagSnapshotLifecycleAtom)
  useAtomValue(registrationDraftRestoreLifecycleAtom)
  useAtomValue(googleCallbackLifecycleAtom)
  return <RegistrationOnboarding url={decodeRegistrationQuery(searchValue)} />
}
