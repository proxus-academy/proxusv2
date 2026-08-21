import { registration_account_accept, registration_account_confirmation, registration_account_description, registration_account_email, registration_account_password, registration_account_submit, registration_account_title, registration_account_legal } from "../../../paraglide/messages.js"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import { PASSWORD_MIN_LENGTH } from "@proxus/shared/auth"
import { Button, Center, Form, Heading, Inline, LinkButton, Stack, Text } from "@proxus/ui"
import { Option } from "effect"
import { RegistrationAccountForm } from "../forms.js"
import { RegistrationFailure } from "../registration-summary.js"
import {
  registrationBusyAtom,
  submitEmailRegistrationAction,
} from "../state.js"
import { RichText } from "../../../platform/rich-text.js"

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
  return (
    <Center as="main" maxWidth="content">
      <Stack gap="xl">
      <Stack gap="sm">
        <Heading level={1}>{registration_account_title()}</Heading>
        <Text tone="muted">{registration_account_description()}</Text>
      </Stack>
      <RegistrationFailure />
      <Form gap="xl" onSubmit={(event) => {
          event.preventDefault()
          submitForm({
            submit: ({ email, password }) => submitAccount({ email, password }),
          })
        }}>
          <RegistrationAccountForm.email label={registration_account_email()} type="email" />
          <RegistrationAccountForm.password label={registration_account_password()} type="password" />
          <RegistrationAccountForm.confirmation label={registration_account_confirmation()} type="password" />
          <RegistrationAccountForm.terms label={registration_account_accept()} />
          <Text size="sm" tone="muted">
            <RichText
              message={registration_account_legal()}
              components={{
                terms: (children) => <LinkButton href="https://proxus.es/terms" target="_blank" rel="noreferrer">{children}</LinkButton>,
                privacy: (children) => <LinkButton href="https://proxus.es/privacy" target="_blank" rel="noreferrer">{children}</LinkButton>,
              }}
            />
          </Text>
        <Inline justify="end">
          <Button type="submit" loading={busy} disabled={!canSubmit}>{registration_account_submit()}</Button>
        </Inline>
      </Form>
      </Stack>
    </Center>
  )
}
