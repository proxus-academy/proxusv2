import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { RegistrationDraft } from "@proxus/frontend-core/registration"
import { Button, Heading, Input, Text } from "@proxus/ui"
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
    <main className="space-y-6">
      <div>
        <Heading level={1}>¿Cómo quieres que te llamemos?</Heading>
        <Text className="mt-2" tone="muted">Elige un nombre de usuario único y dinos tu año de nacimiento.</Text>
      </div>
      <form className="space-y-5" onSubmit={submit}>
        <label className="block space-y-2 font-medium">
          <span>Nombre de usuario</span>
          <Input
            aria-busy={availability.checking || undefined}
            aria-invalid={username.length > 0 && (!usernameValid || availability.available === false)}
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.currentTarget.value)}
          />
        </label>
        {username.length > 0 && !usernameValid
          ? <Text className="text-sm" tone="destructive">Usa entre 3 y 30 letras, números o guiones bajos.</Text>
          : availability.username === username && availability.checking
          ? <Text className="text-sm" tone="muted">Comprobando disponibilidad…</Text>
          : availability.username === username && availability.available !== undefined
          ? <Text className="text-sm" tone={availability.available ? "muted" : "destructive"}>
            {availability.available ? "Nombre de usuario disponible." : "Ese nombre de usuario ya está en uso."}
          </Text>
          : null}
        <label className="block space-y-2 font-medium">
          <span>Año de nacimiento</span>
          <Input
            aria-invalid={birthYear.length > 0 && !birthYearValid}
            inputMode="numeric"
            max={currentYear - 13}
            min={currentYear - 100}
            type="number"
            value={birthYear}
            onChange={(event) => setBirthYear(event.currentTarget.value)}
          />
        </label>
        <Button disabled={!canContinue} type="submit">Continuar</Button>
      </form>
    </main>
  )
}
