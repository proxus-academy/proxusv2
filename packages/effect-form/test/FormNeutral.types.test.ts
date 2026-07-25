import { Field, Form, FormBuilder } from "@proxus/effect-form"
import * as Schema from "effect/Schema"
import type * as Atom from "effect/unstable/reactivity/Atom"
import { expectTypeOf, it } from "vitest"

it("preserves values, output, error and submit args across renderer-neutral bindings", () => {
  const builder = FormBuilder.empty
    .addField(Field.makeField("name", Schema.String))
    .addField(Field.makeField("age", Schema.Number))
  const form = Form.make(builder, {
    onSubmit: (args: { readonly intent: "save" }, { decoded }) => ({ args, decoded }),
  })

  type Output = { readonly args: { readonly intent: "save" }; readonly decoded: { readonly name: string; readonly age: number } }
  expectTypeOf(form.submit).toMatchTypeOf<Atom.AtomResultFn<{ readonly intent: "save" }, Output, Schema.SchemaError>>()
  expectTypeOf(form.setValues).toMatchTypeOf<Atom.Writable<{ readonly name: string; readonly age: number }>>()

  const bind = <F,>(neutral: F) => ({ neutral })
  expectTypeOf(bind(form).neutral).toEqualTypeOf<typeof form>()
})
