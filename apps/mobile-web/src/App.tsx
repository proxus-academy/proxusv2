import { useAtomMount } from "@effect/atom-react"
import { composition } from "./composition.js"
import { RegistrationWizard } from "./modules/registration/registration-wizard.js"

export function App() {
  useAtomMount(composition.featureFlags.lifecycleAtom)
  return <RegistrationWizard />
}
