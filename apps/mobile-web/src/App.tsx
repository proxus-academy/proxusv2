import { useAtomMount } from "@effect/atom-react"
import { composition } from "./composition.js"
import { RegistrationWizard } from "./modules/registration/registration-wizard.js"

function ProductLifecycle() {
  useAtomMount(composition.locale.localeLifecycleAtom)
  useAtomMount(composition.featureFlags.lifecycleAtom)
  useAtomMount(composition.registration.registrationPathLifecycleAtom)
  return null
}

export function App() {
  return (
    <>
      <ProductLifecycle />
      <RegistrationWizard />
    </>
  )
}
