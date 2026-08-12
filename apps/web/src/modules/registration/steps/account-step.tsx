import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import { PASSWORD_MIN_LENGTH } from "@proxus/shared/auth"
import { Button, Heading, Text } from "@proxus/ui"
import { Option } from "effect"
import { RegistrationAccountForm } from "../forms.js"
import { RegistrationFailure } from "../registration-summary.js"
import {
  registrationBusyAtom,
  submitEmailRegistrationAction,
} from "../state.js"
import { Trans, useTranslation } from "../../../platform/product-locale/paraglide-react.js"

export function AccountStep({ draft }: { readonly draft: RegistrationDraft }) {
  return (
    <RegistrationAccountForm.Initialize defaultValues={{
      email: "",
      password: "",
      confirmation: "",
      terms: false,
    }}>
      <RegistrationAccountForm.KeepAlive />
      <AccountFormContent draft={draft} />
    </RegistrationAccountForm.Initialize>
  )
}

function AccountFormContent({ draft: _draft }: { readonly draft: RegistrationDraft }) {
  const submitAccount = useAtomSet(submitEmailRegistrationAction)
  const submitForm = useAtomSet(RegistrationAccountForm.submit)
  const busy = useAtomValue(registrationBusyAtom)
  const values = useAtomValue(RegistrationAccountForm.values)
  const canSubmit = Option.match(values, {
    onNone: () => false,
    onSome: ({ email, password, confirmation, terms }) => (
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      && password.length >= PASSWORD_MIN_LENGTH
      && password === confirmation
      && terms
    ),
  })
  const { t } = useTranslation("registration", { keyPrefix: "account" })
  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <Heading level={1}>{t("title")}</Heading>
        <Text tone="muted">{t("description")}</Text>
      </div>
      <RegistrationFailure />
      <form className="space-y-5" onSubmit={(event) => {
          event.preventDefault()
          submitForm({
            submit: ({ email, password }) => submitAccount({ email, password }),
          })
        }}>
          <RegistrationAccountForm.email label={t("email")} type="email" />
          <RegistrationAccountForm.password label={t("password")} type="password" />
          <RegistrationAccountForm.confirmation label={t("confirmation")} type="password" />
          <RegistrationAccountForm.terms label={t("accept")} />
          <Text className="text-sm leading-relaxed" tone="muted">
            <Trans t={t} i18nKey="legal" components={{ terms: <a className="text-primary underline" href="https://proxus.es/terms" target="_blank" rel="noreferrer" />, privacy: <a className="text-primary underline" href="https://proxus.es/privacy" target="_blank" rel="noreferrer" /> }} />
          </Text>
        <div className="flex justify-end pt-1">
          <Button type="submit" loading={busy} disabled={!canSubmit}>{t("submit")}</Button>
        </div>
      </form>
    </main>
  )
}
