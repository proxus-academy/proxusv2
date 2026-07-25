import { FormReact } from "@proxus/effect-form/react"
import {
  registrationAccountForm,
  registrationProfileForm,
} from "@proxus/frontend-core/registration"
import { CheckboxField, NumberField, TextField } from "@proxus/frontend-web/form"

export { registrationAccountForm, registrationProfileForm }

export const RegistrationProfileForm = FormReact.make(registrationProfileForm, {
  fields: { username: TextField, birthYear: NumberField },
})

export const RegistrationAccountForm = FormReact.make(registrationAccountForm, {
  fields: { email: TextField, password: TextField, terms: CheckboxField },
})
