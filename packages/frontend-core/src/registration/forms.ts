import { Field, FormBuilder } from "@lucas-barake/effect-form"
import { PASSWORD_MIN_LENGTH } from "@proxus/shared/auth"
import { DateTime, Schema } from "effect"

const currentYear = DateTime.toPartsUtc(DateTime.makeUnsafe(globalThis.performance.timeOrigin)).year

export const registrationProfileFormBuilder = FormBuilder.empty
  .addField(Field.makeField("username", Schema.String.pipe(
    Schema.check(Schema.isPattern(/^[A-Za-z0-9_]{3,30}$/, {
      message: "validation.username.invalid",
    })),
  )))
  .addField(Field.makeField("birthYear", Schema.Number.pipe(
    Schema.check(Schema.isBetween({ minimum: currentYear - 100, maximum: currentYear - 13 }, {
      message: "validation.birthYear.invalid",
    })),
  )))

export const registrationAccountFormBuilder = FormBuilder.empty
  .addField(Field.makeField("email", Schema.String.pipe(
    Schema.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: "validation.email.invalid" })),
  )))
  .addField(Field.makeField("password", Schema.String.pipe(
    Schema.check(Schema.isMinLength(PASSWORD_MIN_LENGTH, { message: "validation.password.minLength" })),
  )))
  .addField(Field.makeField("confirmation", Schema.String.pipe(
    Schema.check(Schema.isMinLength(1, { message: "validation.password.confirmationRequired" })),
  )))
  .addField(Field.makeField("terms", Schema.Boolean))
  .refine(({ password, confirmation }) => password === confirmation || {
    path: ["confirmation"],
    issue: "validation.password.mismatch",
  })
  .refine(({ terms }) => terms || {
    path: ["terms"],
    issue: "validation.terms.required",
  })
