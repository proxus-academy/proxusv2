import { FormReact } from "@lucas-barake/effect-form-react"
import {
  registrationAccountFormBuilder,
  registrationProfileFormBuilder,
} from "@proxus/frontend-core/registration"
import { CheckboxField, NumberField, TextField } from "../../platform/form/index.js"

export const RegistrationProfileForm = FormReact.make(registrationProfileFormBuilder, {
  fields: { username: TextField, birthYear: NumberField },
  mode: { validation: "onSubmit" },
  onSubmit: (
    submit: (value: { readonly username: string; readonly birthYear: number }) => void,
    { decoded },
  ) => submit(decoded),
})

export const RegistrationAccountForm = FormReact.make(registrationAccountFormBuilder, {
  fields: { email: TextField, password: TextField, terms: CheckboxField },
  mode: { validation: "onSubmit" },
  onSubmit: (
    submit: (value: { readonly email: string; readonly password: string; readonly terms: boolean }) => void,
    { decoded },
  ) => submit(decoded),
})
