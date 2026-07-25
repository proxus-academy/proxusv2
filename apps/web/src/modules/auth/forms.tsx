import { FormReact } from "@proxus/effect-form/react"
import {
  forgotPasswordForm,
  loginForm,
  newPasswordForm,
  recoveryCodeForm,
} from "@proxus/frontend-core/auth"
import { TextField } from "@proxus/frontend-web/form"

export { forgotPasswordForm, loginForm, newPasswordForm, recoveryCodeForm }

export const LoginForm = FormReact.make(loginForm, {
  fields: { email: TextField, password: TextField },
})

export const ForgotPasswordForm = FormReact.make(forgotPasswordForm, {
  fields: { email: TextField },
})

export const RecoveryCodeForm = FormReact.make(recoveryCodeForm, {
  fields: { code: TextField },
})

export const NewPasswordForm = FormReact.make(newPasswordForm, {
  fields: { password: TextField, confirmation: TextField },
})
