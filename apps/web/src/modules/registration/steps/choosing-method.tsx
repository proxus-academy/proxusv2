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
import { navigateAction } from "../../../routes/navigation.js"
import { useTranslation } from "react-i18next"

export function ChoosingMethod() {
  const beginGoogle = useAtomSet(beginGoogleRegistrationAction)
  const beginEmail = useAtomSet(beginEmailRegistrationAction)
  const navigate = useAtomSet(navigateAction)
  const busy = useAtomValue(registrationBusyAtom)
  const assignment = useAtomValue(registrationLandingAssignmentAtom)
  useAtomValue(registrationLandingExposureLifecycleAtom)
  const { t } = useTranslation("registration", { keyPrefix: "chooseMethod" })
  return (
    <main className="registration-hero">
      <Text className="mb-4 inline-flex rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
        {t("badge")}
      </Text>
      <Heading level={1} className="max-w-2xl text-4xl leading-[1.08] md:text-6xl">
        {t("title")}
      </Heading>
      <Text className="mt-5 max-w-xl text-lg leading-relaxed" tone="muted">
        {t("description")}
      </Text>
      {assignment._tag === "Success" && assignment.value.variant === "long"
        ? <Text className="mt-2" tone="muted">{t("longDescription")}</Text>
        : null}
      <RegistrationFailure />
      <div className="mt-8 flex max-w-xl flex-col gap-3 sm:flex-row">
        <Button
          className="flex-1"
          size="lg"
          loading={busy}
          onClick={() => beginGoogle({
            requestId: `${globalThis.performance.timeOrigin}:${globalThis.performance.now()}`,
          })}
        >
          {t("google")}
        </Button>
        <Button className="flex-1" size="lg" variant="secondary" loading={busy} onClick={() => beginEmail()}>{t("email")}</Button>
      </div>
      <Button className="mt-3" variant="ghost" onClick={() => navigate({ id: "login" })}>{t("login")}</Button>
    </main>
  )
}
