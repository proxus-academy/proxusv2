import type { FormReact } from "@lucas-barake/effect-form-react"
import { isValidationMessageCode } from "@proxus/product-messages"
import { common_unexpectedError, "validation_validation.birthYear.invalid" as validation_validation_birthYear_invalid, "validation_validation.email.invalid" as validation_validation_email_invalid, "validation_validation.email.required" as validation_validation_email_required, "validation_validation.password.confirmationRequired" as validation_validation_password_confirmationRequired, "validation_validation.password.minLength" as validation_validation_password_minLength, "validation_validation.password.mismatch" as validation_validation_password_mismatch, "validation_validation.password.required" as validation_validation_password_required, "validation_validation.recoveryCode.invalid" as validation_validation_recoveryCode_invalid, "validation_validation.terms.required" as validation_validation_terms_required, "validation_validation.username.invalid" as validation_validation_username_invalid } from "../../paraglide/messages.js"
import { Checkbox, Field, FieldControl, FieldError, FieldLabel, Input } from "@proxus/ui"
import * as Option from "effect/Option"
import * as React from "react"

const validationMessages = {
  "validation.email.required": validation_validation_email_required,
  "validation.email.invalid": validation_validation_email_invalid,
  "validation.password.required": validation_validation_password_required,
  "validation.recoveryCode.invalid": validation_validation_recoveryCode_invalid,
  "validation.password.minLength": validation_validation_password_minLength,
  "validation.password.confirmationRequired": validation_validation_password_confirmationRequired,
  "validation.password.mismatch": validation_validation_password_mismatch,
  "validation.username.invalid": validation_validation_username_invalid,
  "validation.birthYear.invalid": validation_validation_birthYear_invalid,
  "validation.terms.required": validation_validation_terms_required,
}

const useLocalizedError = (error: string | undefined) => {
  if (error === undefined) return undefined
  return isValidationMessageCode(error)
    ? validationMessages[error]()
    : common_unexpectedError()
}

export type TextFieldProps = Omit<React.ComponentProps<typeof Input>,
  "value" | "defaultValue" | "onChange" | "onBlur" | "aria-invalid" | "aria-describedby"
> & { readonly label: React.ReactNode }

export const TextField: FormReact.FieldComponent<string, TextFieldProps> = ({ field, props }) => {
  const generatedId = React.useId()
  const id = props.id ?? generatedId
  const fieldError = Option.getOrUndefined(field.error)
  const error = useLocalizedError(fieldError)
  const errorId = `${id}-error`
  return <Field invalid={error !== undefined} disabled={props.disabled === true}>
    <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
    <FieldControl><Input {...props} id={id} value={field.value} onChange={(event) => field.onChange(event.currentTarget.value)} onBlur={field.onBlur} aria-invalid={error !== undefined} aria-describedby={error === undefined ? undefined : errorId} aria-busy={field.isValidating || undefined} /></FieldControl>
    <FieldError id={errorId}>{error}</FieldError>
  </Field>
}

export type NumberFieldProps = Omit<TextFieldProps, "type">
export const NumberField: FormReact.FieldComponent<number, NumberFieldProps> = ({ field, props }) => {
  const generatedId = React.useId()
  const id = props.id ?? generatedId
  const fieldError = Option.getOrUndefined(field.error)
  const error = useLocalizedError(fieldError)
  const errorId = `${id}-error`
  return <Field invalid={error !== undefined} disabled={props.disabled === true}>
    <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
    <FieldControl><Input {...props} id={id} type="number" value={field.value} onChange={(event) => field.onChange(event.currentTarget.valueAsNumber)} onBlur={field.onBlur} aria-invalid={error !== undefined} aria-describedby={error === undefined ? undefined : errorId} aria-busy={field.isValidating || undefined} /></FieldControl>
    <FieldError id={errorId}>{error}</FieldError>
  </Field>
}

export type CheckboxFieldProps = Omit<React.ComponentProps<typeof Checkbox>,
  "checked" | "defaultChecked" | "onCheckedChange" | "onBlur" | "aria-invalid" | "aria-describedby"
> & { readonly label: React.ReactNode }

export const CheckboxField: FormReact.FieldComponent<boolean, CheckboxFieldProps> = ({ field, props }) => {
  const generatedId = React.useId()
  const id = props.id ?? generatedId
  const fieldError = Option.getOrUndefined(field.error)
  const error = useLocalizedError(fieldError)
  const errorId = `${id}-error`
  return <Field invalid={error !== undefined} disabled={props.disabled === true}>
    <FieldControl><Checkbox {...props} id={id} checked={field.value} onCheckedChange={(value) => field.onChange(value === true)} onBlur={field.onBlur} aria-invalid={error !== undefined} aria-describedby={error === undefined ? undefined : errorId} aria-busy={field.isValidating || undefined} /><FieldLabel htmlFor={id}>{props.label}</FieldLabel></FieldControl>
    <FieldError id={errorId}>{error}</FieldError>
  </Field>
}
