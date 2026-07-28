import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Button, Heading, Text } from "@proxus/ui"
import {
  registrationLandingAssignmentAtom,
  registrationLandingExposureLifecycleAtom,
} from "../feature-flags.js"
import { RegistrationFailure } from "../registration-summary.js"
import {
  beginEmailRegistrationAction,
  beginGoogleRegistrationAction,
  registrationBusyAtom,
} from "../state.js"
import { useRouter } from "../../../routes/use-router.js"

export function ChoosingMethod() {
  const beginGoogle = useAtomSet(beginGoogleRegistrationAction)
  const beginEmail = useAtomSet(beginEmailRegistrationAction)
  const router = useRouter()
  const busy = useAtomValue(registrationBusyAtom)
  const assignment = useAtomValue(registrationLandingAssignmentAtom)
  useAtomValue(registrationLandingExposureLifecycleAtom)
  return (
    <main>
      <Heading level={1}>Empieza a estudiar a tu manera</Heading>
      <Text>Cuéntanos qué necesitas y qué estudias.</Text>
      {assignment._tag === "Success" && assignment.value.variant === "long"
        ? <Text>Personaliza tu experiencia para encontrar antes los contenidos que necesitas.</Text>
        : null}
      <RegistrationFailure />
      <Button disabled={busy} onClick={() => beginGoogle()}>Continuar con Google</Button>
      <Button disabled={busy} onClick={() => beginEmail()}>Empezar con email</Button>
      <Button variant="ghost" onClick={() => router.navigate("login")}>Ya tengo cuenta</Button>
    </main>
  )
}
