import { FormReact } from "@lucas-barake/effect-form-react"
import {
  forgotPasswordFormBuilder,
  loginFormBuilder,
  newPasswordFormBuilder,
  recoveryCodeFormBuilder,
} from "@proxus/frontend-core/auth"
import { publicApiClient } from "@proxus/frontend-core/public-api"
import { applicationRuntime } from "@proxus/frontend-core/runtime"
import { LoginWithPasswordInput } from "@proxus/shared/auth"
import { Effect, Schema } from "effect"
import { TextField } from "../../platform/form/index.js"

export const LoginForm = FormReact.make(loginFormBuilder, {
  runtime: applicationRuntime,
  fields: { email: TextField, password: TextField },
  mode: { validation: "onSubmit" },
  reactivityKeys: ["auth"],
  onSubmit: (_: void, { decoded }) => Effect.gen(function*() {
    const input = yield* Schema.decodeUnknownEffect(LoginWithPasswordInput)(decoded)
    return yield* publicApiClient.pipe(
      Effect.flatMap((client) => client.auth.loginWithPassword({ payload: input })),
    )
  }),
})

export const ForgotPasswordForm = FormReact.make(forgotPasswordFormBuilder, {
  fields: { email: TextField },
  mode: { validation: "onSubmit" },
  onSubmit: (submit: (values: { readonly email: string }) => void, { decoded }) => submit(decoded),
})

export const RecoveryCodeForm = FormReact.make(recoveryCodeFormBuilder, {
  fields: { code: TextField },
  mode: { validation: "onSubmit" },
  onSubmit: (submit: (values: { readonly code: string }) => void, { decoded }) => submit(decoded),
})

export const NewPasswordForm = FormReact.make(newPasswordFormBuilder, {
  fields: { password: TextField, confirmation: TextField },
  mode: { validation: "onSubmit" },
  onSubmit: (submit: (values: { readonly password: string }) => void, { decoded }) =>
    submit({ password: decoded.password }),
})
