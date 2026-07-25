import type * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Schema from "effect/Schema"
import * as Atom from "effect/unstable/reactivity/Atom"
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as Field from "./Field.js"
import * as FormAtoms from "./FormAtoms.js"
import * as FormBuilder from "./FormBuilder.js"
import type * as Mode from "./Mode.js"

/** @internal Renderer bridge. Product code should use the public atoms instead. */
export const RendererInternals: unique symbol = Symbol.for("@proxus/effect-form/Form/RendererInternals")

export interface Internals<TFields extends Field.FieldsRecord> {
  readonly fields: TFields
  readonly atoms: FormAtoms.FormAtoms<TFields, any, any, any, any>
}

export interface Form<
  TFields extends Field.FieldsRecord,
  R,
  A = void,
  E = never,
  SubmitArgs = void,
> {
  readonly values: Atom.Atom<import("effect/Option").Option<Field.EncodedFromFields<TFields>>>
  readonly isDirty: Atom.Atom<boolean>
  readonly hasChangedSinceSubmit: Atom.Atom<boolean>
  readonly lastSubmittedValues: Atom.Atom<import("effect/Option").Option<FormBuilder.SubmittedValues<TFields>>>
  readonly submitCount: Atom.Atom<number>
  readonly validationCount: Atom.Atom<number>
  readonly rootError: Atom.Atom<import("effect/Option").Option<string>>
  readonly schema: Schema.Codec<Field.DecodedFromFields<TFields>, Field.EncodedFromFields<TFields>, R>
  readonly fields: FormAtoms.FieldRefs<TFields>
  readonly submit: Atom.AtomResultFn<SubmitArgs, A, E | Schema.SchemaError>
  readonly validate: Atom.AtomResultFn<void, void, never>
  readonly reset: Atom.Writable<void, void>
  readonly revertToLastSubmit: Atom.Writable<void, void>
  readonly setValues: Atom.Writable<Field.EncodedFromFields<TFields>>
  readonly getFieldAtoms: <S>(field: FormBuilder.FieldRef<S>) => FormAtoms.PublicFieldAtoms<S>
  readonly mount: Atom.Atom<void>
  readonly [RendererInternals]: Internals<TFields>
}

type CommonOptions<TFields extends Field.FieldsRecord, R, A, E, SubmitArgs> = {
  readonly mode?: [SubmitArgs] extends [void] ? Mode.FormMode : Mode.FormModeWithoutAutoSubmit
  readonly reactivityKeys?: ReadonlyArray<unknown> | Readonly<Record<string, ReadonlyArray<unknown>>>
  readonly onSubmit: (
    args: SubmitArgs,
    ctx: {
      readonly decoded: Field.DecodedFromFields<TFields>
      readonly encoded: Field.EncodedFromFields<TFields>
      readonly get: Atom.FnContext
    }
  ) => A | Effect.Effect<A, E, R>
}

export const make: {
  <TFields extends Field.FieldsRecord, R extends AtomRegistry.AtomRegistry, A, E, SubmitArgs = void>(
    builder: FormBuilder.FormBuilder<TFields, R>,
    options: CommonOptions<TFields, R, A, E, SubmitArgs> & {
      readonly runtime?: Atom.AtomRuntime<any, any>
    }
  ): Form<TFields, R, A, E, SubmitArgs>

  <TFields extends Field.FieldsRecord, R, A, E, SubmitArgs = void, ER = never>(
    builder: FormBuilder.FormBuilder<TFields, R>,
    options: CommonOptions<TFields, R, A, E, SubmitArgs> & {
      readonly runtime: Atom.AtomRuntime<R, ER>
    }
  ): Form<TFields, R, A, E, SubmitArgs>
} = (builder: any, options: any): any => {
  const atoms = FormAtoms.make({
    formBuilder: builder,
    runtime: options.runtime ?? Atom.runtime(Layer.empty),
    mode: options.mode,
    reactivityKeys: options.reactivityKeys,
    onSubmit: options.onSubmit
  })

  return {
    values: atoms.valuesAtom,
    isDirty: atoms.isDirtyAtom,
    hasChangedSinceSubmit: atoms.hasChangedSinceSubmitAtom,
    lastSubmittedValues: atoms.lastSubmittedValuesAtom,
    submitCount: atoms.submitCountAtom,
    validationCount: atoms.validationCountAtom,
    rootError: atoms.rootErrorAtom,
    schema: atoms.combinedSchema,
    fields: atoms.fieldRefs,
    submit: atoms.submitAtom,
    validate: atoms.validateAtom,
    reset: atoms.resetAtom,
    revertToLastSubmit: atoms.revertToLastSubmitAtom,
    setValues: atoms.setValuesAtom,
    getFieldAtoms: atoms.getFieldAtoms,
    mount: atoms.mountAtom,
    [RendererInternals]: { fields: builder.fields, atoms }
  }
}
