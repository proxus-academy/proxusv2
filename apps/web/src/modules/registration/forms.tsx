import { FormReact, type FormReact as EffectFormReact } from "@lucas-barake/effect-form-react"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { emailAvailabilityAction, usernameAvailabilityAction } from "@proxus/frontend-core/auth"
import {
  registrationAccountFormBuilder,
} from "@proxus/frontend-core/registration"
import { CheckboxField, TextField } from "../../platform/form/index.js"
import type { TextFieldProps } from "../../platform/form/index.js"
import { Text } from "@proxus/ui"
import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { useEffect } from "react"
import { useTranslation } from "../../platform/product-locale/paraglide-react.js"

export interface UsernameAvailabilityState {
  readonly username: string
  readonly available: boolean | undefined
  readonly checking: boolean
}

export const registrationUsernameAvailabilityAtom = Atom.make<UsernameAvailabilityState>({
  username: "",
  available: undefined,
  checking: false,
})

export const checkRegistrationUsernameAction = Atom.fn<string>()((username, get) => Effect.gen(function*() {
  get.set(registrationUsernameAvailabilityAtom, { username, available: undefined, checking: true })
  const available = yield* get.setResult(usernameAvailabilityAction, username).pipe(
    Effect.match({
      onFailure: () => undefined,
      onSuccess: (result) => result.available,
    }),
  )
  get.set(registrationUsernameAvailabilityAtom, { username, available, checking: false })
}))

const EmailAvailabilityField: EffectFormReact.FieldComponent<string, TextFieldProps> = ({ field, props }) => {
  const check = useAtomSet(emailAvailabilityAction)
  const result = useAtomValue(emailAvailabilityAction)
  const { t } = useTranslation("registration", { keyPrefix: "account" })
  useEffect(() => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value)) return
    // React debounce is a browser synchronization concern at this adapter boundary.
    // @effect-diagnostics-next-line globalTimers:off
    const timeout = globalThis.setTimeout(() => check(field.value), 400)
    return () => globalThis.clearTimeout(timeout)
  }, [check, field.value])
  return <>
    <TextField field={field} props={{ ...props, "aria-busy": result.waiting || undefined }} />
    {result._tag === "Success" ? <Text className="text-sm" tone={result.value.available ? "muted" : "destructive"}>
      {result.value.available ? t("emailAvailable") : t("emailUnavailable")}
    </Text> : null}
  </>
}

export const RegistrationAccountForm = FormReact.make(registrationAccountFormBuilder, {
  fields: {
    email: EmailAvailabilityField,
    password: TextField,
    confirmation: TextField,
    terms: CheckboxField,
  },
  mode: { validation: "onChange" },
  // Keep submit arguments object-shaped: a bare callback is ambiguous to React-style setters.
  onSubmit: (
    { submit }: {
      readonly submit: (
        value: {
          readonly email: string
          readonly password: string
          readonly confirmation: string
          readonly terms: boolean
        },
      ) => void
    },
    { decoded },
  ) => Effect.sync(() => submit(decoded)),
})
