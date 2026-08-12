import type { FormReact } from "@lucas-barake/effect-form-react"
import { isValidationMessageCode } from "@proxus/product-messages"
import { Checkbox, Field, FieldControl, FieldError, FieldLabel, Input } from "@proxus/ui"
import * as Option from "effect/Option"
import * as React from "react"
import { useTranslation } from "../product-locale/paraglide-react.js"

const useLocalizedError = (error: string | undefined) => {
  const { t: common } = useTranslation("common")
  const { t: validation } = useTranslation("validation")
  if (error === undefined) return undefined
  return isValidationMessageCode(error)
    ? validation(error)
    : common("unexpectedError")
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
