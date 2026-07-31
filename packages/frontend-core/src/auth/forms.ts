import { Field, FormBuilder } from "@lucas-barake/effect-form"
import { PASSWORD_MIN_LENGTH } from "@proxus/shared/auth"
import { Schema } from "effect"

const required = (message: string) => Schema.String.pipe(
  Schema.check(Schema.isMinLength(1, { message })),
)

export const EmailField = Field.makeField("email", required("validation.email.required").pipe(
  Schema.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: "validation.email.invalid" })),
))

export const CurrentPasswordField = Field.makeField("password", required("validation.password.required"))
export const RecoveryCodeField = Field.makeField("code", Schema.String.pipe(
  Schema.check(Schema.isPattern(/^\d{6}$/, { message: "validation.recoveryCode.invalid" })),
))
export const NewPasswordField = Field.makeField("password", Schema.String.pipe(
    Schema.check(Schema.isMinLength(PASSWORD_MIN_LENGTH, { message: "validation.password.minLength" })),
))
export const PasswordConfirmationField = Field.makeField("confirmation", required("validation.password.confirmationRequired"))

export const loginFormBuilder = FormBuilder.empty
  .addField(EmailField)
  .addField(CurrentPasswordField)

export const forgotPasswordFormBuilder = FormBuilder.empty.addField(EmailField)
export const recoveryCodeFormBuilder = FormBuilder.empty.addField(RecoveryCodeField)

export const newPasswordFormBuilder = FormBuilder.empty
  .addField(NewPasswordField)
  .addField(PasswordConfirmationField)
  .refine(({ password, confirmation }) => password === confirmation || {
    path: ["confirmation"],
    issue: "validation.password.mismatch",
  })
