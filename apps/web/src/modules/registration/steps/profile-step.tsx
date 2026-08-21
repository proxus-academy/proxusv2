import { registration_profile_available, registration_profile_birthYear, registration_profile_checking, registration_profile_continue, registration_profile_description, registration_profile_invalidUsername, registration_profile_title, registration_profile_unavailable, registration_profile_username } from "../../../paraglide/messages.js"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import { Button, Field, FieldLabel, Form, Heading, Input, Stack, Text } from "@proxus/ui"
import { DateTime } from "effect"
import { useEffect, useState, type FormEvent } from "react"
import {
  checkRegistrationUsernameAction,
  registrationUsernameAvailabilityAtom,
} from "../forms.js"
import { dispatchRegistrationAction } from "../state.js"

export function ProfileStep({ draft }: { readonly draft: RegistrationDraft }) {
  const dispatch = useAtomSet(dispatchRegistrationAction)
  const checkUsername = useAtomSet(checkRegistrationUsernameAction)
  const availability = useAtomValue(registrationUsernameAvailabilityAtom)
  const [username, setUsername] = useState(draft.username ?? "")
  const [birthYear, setBirthYear] = useState(String(draft.birthYear ?? 2000))
  const usernameValid = /^[A-Za-z0-9_]{3,30}$/.test(username)
  const currentYear = DateTime.toPartsUtc(DateTime.makeUnsafe(globalThis.performance.timeOrigin)).year
  const parsedBirthYear = Number(birthYear)
  const birthYearValid = Number.isInteger(parsedBirthYear)
    && parsedBirthYear >= currentYear - 100
    && parsedBirthYear <= currentYear - 13
  const usernameAvailable = availability.username === username && availability.available === true
  const canContinue = usernameValid && usernameAvailable && birthYearValid && !availability.checking

  useEffect(() => {
    if (!usernameValid) return
    // This view-owned debounce synchronizes local input with the remote validation atom.
    // @effect-diagnostics-next-line globalTimers:off
    const timeout = globalThis.setTimeout(() => checkUsername(username), 400)
    return () => globalThis.clearTimeout(timeout)
  }, [checkUsername, username, usernameValid])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canContinue) return
    dispatch({ _tag: "ProfileCompleted", username, birthYear: parsedBirthYear })
  }

  return (
    <Stack as="main" gap="xl">
      <Stack gap="sm">
        <Heading level={1}>{registration_profile_title()}</Heading>
        <Text tone="muted">{registration_profile_description()}</Text>
      </Stack>
      <Form gap="xl" onSubmit={submit}>
        <Field>
          <FieldLabel>{registration_profile_username()}</FieldLabel>
          <Input
            aria-busy={availability.checking || undefined}
            aria-invalid={username.length > 0 && (!usernameValid || availability.available === false)}
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.currentTarget.value)}
          />
        </Field>
        {username.length > 0 && !usernameValid
          ? <Text size="sm" tone="destructive">{registration_profile_invalidUsername()}</Text>
          : availability.username === username && availability.checking
          ? <Text size="sm" tone="muted">{registration_profile_checking()}</Text>
          : availability.username === username && availability.available !== undefined
          ? <Text size="sm" tone={availability.available ? "muted" : "destructive"}>
            {availability.available ? registration_profile_available() : registration_profile_unavailable()}
          </Text>
          : null}
        <Field>
          <FieldLabel>{registration_profile_birthYear()}</FieldLabel>
          <Input
            aria-invalid={birthYear.length > 0 && !birthYearValid}
            inputMode="numeric"
            max={currentYear - 13}
            min={currentYear - 100}
            type="number"
            value={birthYear}
            onChange={(event) => setBirthYear(event.currentTarget.value)}
          />
        </Field>
        <Button disabled={!canContinue} type="submit">{registration_profile_continue()}</Button>
      </Form>
    </Stack>
  )
}
