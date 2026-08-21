import { registration_chooseMethod_badge, registration_chooseMethod_description, registration_chooseMethod_email, registration_chooseMethod_google, registration_chooseMethod_login, registration_chooseMethod_longDescription, registration_chooseMethod_title } from "../../../paraglide/messages.js"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Button, Grid, Heading, Stack, Text } from "@proxus/ui"
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

export function ChoosingMethod({ onOpenLogin }: { readonly onOpenLogin: () => void }) {
  const beginGoogle = useAtomSet(beginGoogleRegistrationAction)
  const beginEmail = useAtomSet(beginEmailRegistrationAction)
  const busy = useAtomValue(registrationBusyAtom)
  const assignment = useAtomValue(registrationLandingAssignmentAtom)
  useAtomValue(registrationLandingExposureLifecycleAtom)
  return (
    <Stack as="main" gap="lg" paddingY={{ base: "lg", md: "2xl" }}>
      <Text as="span" display="badge" size="sm" weight="semibold" tone="primary">
        {registration_chooseMethod_badge()}
      </Text>
      <Heading level={1} size="hero" width="prose">
        {registration_chooseMethod_title()}
      </Heading>
      <Text size="lg" width="prose" tone="muted">
        {registration_chooseMethod_description()}
      </Text>
      {assignment._tag === "Success" && assignment.value.variant === "long"
        ? <Text tone="muted">{registration_chooseMethod_longDescription()}</Text>
        : null}
      <RegistrationFailure />
      <Grid columns={{ base: "one", md: "two" }} gap="md" maxWidth="lg">
        <Button
          grow
          size="lg"
          loading={busy}
          onClick={() => beginGoogle({
            requestId: `${globalThis.performance.timeOrigin}:${globalThis.performance.now()}`,
          })}
        >
          {registration_chooseMethod_google()}
        </Button>
        <Button grow size="lg" variant="secondary" loading={busy} onClick={() => beginEmail()}>{registration_chooseMethod_email()}</Button>
      </Grid>
      <Button variant="ghost" onClick={onOpenLogin}>{registration_chooseMethod_login()}</Button>
    </Stack>
  )
}
