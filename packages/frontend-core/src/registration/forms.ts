import { Field, FormBuilder } from "@lucas-barake/effect-form"
import { Schema } from "effect"

export const registrationProfileFormBuilder = FormBuilder.empty
  .addField(Field.makeField("username", Schema.String.pipe(
    Schema.check(Schema.isPattern(/^[A-Za-z0-9_]{3,30}$/, {
      message: "validation.username.invalid",
    })),
  )))
  .addField(Field.makeField("birthYear", Schema.Number.pipe(
    Schema.check(Schema.isBetween({ minimum: 1900, maximum: 2100 }, {
      message: "validation.birthYear.invalid",
    })),
  )))

export const registrationAccountFormBuilder = FormBuilder.empty
  .addField(Field.makeField("email", Schema.String.pipe(
    Schema.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: "validation.email.invalid" })),
  )))
  .addField(Field.makeField("password", Schema.String.pipe(
    Schema.check(Schema.isMinLength(12, { message: "validation.password.minLength" })),
  )))
  .addField(Field.makeField("terms", Schema.Boolean))
  .refine(({ terms }) => terms || {
    path: ["terms"],
    issue: "validation.terms.required",
  })
