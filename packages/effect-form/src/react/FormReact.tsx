import { RegistryContext, useAtom, useAtomMount, useAtomSet, useAtomValue } from "@effect/atom-react"
import { Field, Form as NeutralForm, FormAtoms } from "@proxus/effect-form"
import type { FieldState as FieldStateModule } from "@proxus/effect-form"
import type * as FormBuilder from "@proxus/effect-form/FormBuilder"
import { getNestedValue } from "@proxus/effect-form/Path"
import * as Option from "effect/Option"
import type * as Schema from "effect/Schema"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as React from "react"
import { createContext, useContext } from "react"

export type FieldValue<T,> = FieldStateModule.FieldValue<T>

export type FieldState<E,> = FieldStateModule.FieldState<E>

export type ArrayFieldOperations<TItem,> = FieldStateModule.ArrayFieldOperations<TItem>

export interface FieldComponentProps<E, P = Record<string, never>,> {
  readonly field: FieldState<E>
  readonly props: P
}

export type FieldComponent<T, P = Record<string, never>,> = React.FC<FieldComponentProps<FieldValue<T>, P>>

export type ExtractExtraProps<C,> = C extends React.FC<FieldComponentProps<any, infer P>> ? P : Record<string, never>

type StructFieldsFromSchema<S,> = S extends Schema.Struct<infer Fields> ? Fields
  : S extends { readonly from: infer From } ? StructFieldsFromSchema<From>
  : never

export type ArrayItemComponentMap<S extends Schema.Top,> = StructFieldsFromSchema<S> extends Schema.Struct.Fields ? {
    readonly [K in keyof StructFieldsFromSchema<S>]: StructFieldsFromSchema<S>[K] extends Schema.Top
      ? React.FC<FieldComponentProps<Schema.Codec.Encoded<StructFieldsFromSchema<S>[K]>, any>>
      : never
  }
  : React.FC<FieldComponentProps<Schema.Codec.Encoded<S>, any>>

export type FieldComponentMap<TFields extends Field.FieldsRecord,> = {
  readonly [K in keyof TFields]: TFields[K] extends Field.FieldDef<any, infer S>
    ? React.FC<FieldComponentProps<Schema.Codec.Encoded<S>, any>>
    : TFields[K] extends Field.ArrayFieldDef<any, infer S> ? ArrayItemComponentMap<S>
    : never
}

export type FieldRefs<TFields extends Field.FieldsRecord,> = FormAtoms.FieldRefs<TFields>

export interface ProviderProps<TFields extends Field.FieldsRecord> {
  readonly defaultValues: Field.EncodedFromFields<TFields>
  readonly validateOnInit?: boolean
  readonly children: React.ReactNode
}

type SubmitArgsProps<SubmitArgs> = [SubmitArgs] extends [void]
  ? { readonly getSubmitArgs?: never }
  : {
      readonly getSubmitArgs: (
        event: React.FormEvent<HTMLFormElement> & { readonly nativeEvent: SubmitEvent }
      ) => SubmitArgs
    }

export type FormProps<SubmitArgs> =
  & Omit<React.ComponentPropsWithoutRef<"form">, "id" | "onSubmit">
  & SubmitArgsProps<SubmitArgs>

export interface SubmitProps {
  readonly asChild?: boolean
  readonly children: React.ReactElement
}

export type BuiltForm<
  TFields extends Field.FieldsRecord,
  SubmitArgs = void,
  CM extends FieldComponentMap<TFields> = FieldComponentMap<TFields>,
> = {
  readonly Provider: React.FC<ProviderProps<TFields>>
  readonly Form: React.FC<FormProps<SubmitArgs>>
  readonly Submit: React.FC<SubmitProps>
  readonly KeepAlive: React.FC
} & FieldComponents<TFields, CM>

type FieldComponents<TFields extends Field.FieldsRecord, CM extends FieldComponentMap<TFields>,> = {
  readonly [K in keyof TFields]: TFields[K] extends Field.FieldDef<any, any> ? React.FC<ExtractExtraProps<CM[K]>>
    : TFields[K] extends Field.ArrayFieldDef<any, infer S>
      ? ArrayFieldComponent<S, ExtractArrayItemExtraProps<CM[K], S>>
    : never
}

type ExtractArrayItemExtraProps<CM, S extends Schema.Top,> = StructFieldsFromSchema<S> extends Schema.Struct.Fields ? {
    readonly [K in keyof StructFieldsFromSchema<S>]: CM extends { readonly [P in K]: infer C } ? ExtractExtraProps<C>
      : never
  }
  : CM extends React.FC<FieldComponentProps<any, infer P>> ? P
  : never

type ArrayFieldComponent<S extends Schema.Top, ExtraPropsMap,> =
  & React.FC<{
    readonly children: (ops: ArrayFieldOperations<Schema.Codec.Encoded<S>>) => React.ReactNode
  }>
  & {
    readonly Item: React.FC<{
      readonly index: number
      readonly children: React.ReactNode | ((props: { readonly remove: () => void }) => React.ReactNode)
    }>
  }
  & (StructFieldsFromSchema<S> extends Schema.Struct.Fields ? {
      readonly [K in keyof StructFieldsFromSchema<S>]: React.FC<
        ExtraPropsMap extends { readonly [P in K]: infer EP } ? EP : Record<string, never>
      >
    }
    : unknown)

interface ArrayItemContextValue {
  readonly index: number
  readonly parentPath: string
}

const ArrayItemContext = createContext<ArrayItemContextValue | null>(null)

const makeFieldComponent = <S extends Schema.Top, P,>(
  fieldKey: string,
  fieldDef: Field.FieldDef<string, S>,
  getOrCreateFieldAtoms: (fieldPath: string, schema: Schema.Top) => FormAtoms.FieldAtoms,
  Component: React.FC<FieldComponentProps<Schema.Codec.Encoded<S>, P>>,
  onBlurSubmitAtom: Atom.Writable<void, void>
): React.FC<P> => {
  const FieldComponent: React.FC<P> = (extraProps) => {
    const arrayCtx = useContext(ArrayItemContext)
    const fieldPath = arrayCtx ? `${arrayCtx.parentPath}.${fieldKey}` : fieldKey

    const fieldAtoms = React.useMemo(
      () => getOrCreateFieldAtoms(fieldPath, fieldDef.schema),
      [fieldPath]
    )

    const [value, setValue] = useAtom(fieldAtoms.valueAtom) as [Schema.Codec.Encoded<S>, (v: unknown) => void]
    const [isTouched, setTouched] = useAtom(fieldAtoms.touchedAtom)
    const displayError = useAtomValue(fieldAtoms.displayErrorAtom)
    const isDirty = useAtomValue(fieldAtoms.isDirtyAtom)
    const isValidating = useAtomValue(fieldAtoms.validationAtom).waiting
    const setOnBlurSubmit = useAtomSet(onBlurSubmitAtom)

    useAtomMount(fieldAtoms.triggerValidationAtom)

    const onChange = React.useCallback(
      (newValue: Schema.Codec.Encoded<S>) => setValue(newValue),
      [setValue]
    )

    const onBlur = React.useCallback(() => {
      setTouched(true)
      setOnBlurSubmit()
    }, [setTouched, setOnBlurSubmit])

    const fieldState = React.useMemo(
      () => ({
        path: fieldPath,
        value,
        onChange,
        onBlur,
        error: displayError,
        isTouched,
        isValidating,
        isDirty
      }),
      [fieldPath, value, onChange, onBlur, displayError, isTouched, isValidating, isDirty]
    )

    return <Component field={fieldState} props={extraProps} />
  }
  return React.memo(FieldComponent) as React.FC<P>
}

const makeArrayFieldComponent = <S extends Schema.Top,>(
  fieldKey: string,
  def: Field.ArrayFieldDef<string, S>,
  stateAtom: Atom.Writable<Option.Option<FormBuilder.FormState<any>>, Option.Option<FormBuilder.FormState<any>>>,
  getOrCreateFieldAtoms: (fieldPath: string, schema: Schema.Top) => FormAtoms.FieldAtoms,
  operations: FormAtoms.FormOperations<any>,
  componentMap: ArrayItemComponentMap<S>,
  onBlurSubmitAtom: Atom.Writable<void, void>
): ArrayFieldComponent<S, any> => {
  const ArrayWrapper: React.FC<{
    readonly children: (ops: ArrayFieldOperations<Schema.Codec.Encoded<S>>) => React.ReactNode
  }> = ({ children }) => {
    const arrayCtx = useContext(ArrayItemContext)
    const [formStateOption, setFormState] = useAtom(stateAtom)

    const fieldPath = arrayCtx ? `${arrayCtx.parentPath}.${fieldKey}` : fieldKey
    if (Option.isNone(formStateOption)) {
      throw new Error(
        `Array field "${fieldPath}" was rendered before the form was initialized. ` +
          "Form state does not exist until initialization: render array field components inside " +
          "the Provider returned by the same FormReact.make call. " +
          `See the "Basic Form Setup" section of the README.`
      )
    }
    const formState = formStateOption.value
    const items = React.useMemo(
      () => (getNestedValue(formState.values, fieldPath) ?? []) as ReadonlyArray<Schema.Codec.Encoded<S>>,
      [formState.values, fieldPath]
    )

    const append = React.useCallback(
      (value?: Schema.Codec.Encoded<S>) => {
        setFormState((prev) => {
          if (Option.isNone(prev)) return prev
          return Option.some(operations.appendArrayItem(prev.value, fieldPath, def.itemSchema, value))
        })
      },
      [fieldPath, setFormState]
    )

    const remove = React.useCallback(
      (index: number) => {
        setFormState((prev) => {
          if (Option.isNone(prev)) return prev
          return Option.some(operations.removeArrayItem(prev.value, fieldPath, index))
        })
      },
      [fieldPath, setFormState]
    )

    const swap = React.useCallback(
      (indexA: number, indexB: number) => {
        setFormState((prev) => {
          if (Option.isNone(prev)) return prev
          return Option.some(operations.swapArrayItems(prev.value, fieldPath, indexA, indexB))
        })
      },
      [fieldPath, setFormState]
    )

    const move = React.useCallback(
      (from: number, to: number) => {
        setFormState((prev) => {
          if (Option.isNone(prev)) return prev
          return Option.some(operations.moveArrayItem(prev.value, fieldPath, from, to))
        })
      },
      [fieldPath, setFormState]
    )

    return <>{children({ items, append, remove, swap, move })}</>
  }

  const ItemWrapper: React.FC<{
    readonly index: number
    readonly children: React.ReactNode | ((props: { readonly remove: () => void }) => React.ReactNode)
  }> = ({ children, index }) => {
    const arrayCtx = useContext(ArrayItemContext)
    const setFormState = useAtomSet(stateAtom)

    const parentPath = arrayCtx ? `${arrayCtx.parentPath}.${fieldKey}` : fieldKey
    const itemPath = `${parentPath}[${index}]`

    const remove = React.useCallback(() => {
      setFormState((prev) => {
        if (Option.isNone(prev)) return prev
        return Option.some(operations.removeArrayItem(prev.value, parentPath, index))
      })
    }, [parentPath, index, setFormState])

    return (
      <ArrayItemContext.Provider value={{ index, parentPath: itemPath }}>
        {typeof children === "function" ? children({ remove }) : children}
      </ArrayItemContext.Provider>
    )
  }

  const itemFieldComponents: Record<string, React.FC> = {}

  const subFieldDefs = Field.extractStructFieldDefs(def.itemSchema)
  if (subFieldDefs) {
    for (const subDef of subFieldDefs) {
      const itemComponent = (componentMap as Record<string, React.FC<FieldComponentProps<any, any>>>)[subDef.key]
      if (itemComponent === undefined) {
        throw new Error(`Missing field component for ${subDef.key}`)
      }
      itemFieldComponents[subDef.key] = makeFieldComponent(
        subDef.key,
        subDef,
        getOrCreateFieldAtoms,
        itemComponent,
        onBlurSubmitAtom
      )
    }
  }

  const properties: Record<string, unknown> = {
    Item: ItemWrapper,
    ...itemFieldComponents
  }

  return new Proxy(ArrayWrapper, {
    get(target, prop) {
      if (prop in properties) {
        return properties[prop as string]
      }
      return Reflect.get(target, prop)
    }
  }) as ArrayFieldComponent<S, any>
}

const makeFieldComponents = <TFields extends Field.FieldsRecord, CM extends FieldComponentMap<TFields>,>(
  fields: TFields,
  stateAtom: Atom.Writable<
    Option.Option<FormBuilder.FormState<TFields>>,
    Option.Option<FormBuilder.FormState<TFields>>
  >,
  getOrCreateFieldAtoms: (fieldPath: string, schema: Schema.Top) => FormAtoms.FieldAtoms,
  operations: FormAtoms.FormOperations<TFields>,
  componentMap: CM,
  onBlurSubmitAtom: Atom.Writable<void, void>
): FieldComponents<TFields, CM> => {
  const components: Record<string, any> = {}

  for (const [key, def] of Object.entries(fields)) {
    if (Field.isArrayFieldDef(def)) {
      const arrayComponentMap = (componentMap as Record<string, any>)[key]
      components[key] = makeArrayFieldComponent(
        key,
        def as Field.ArrayFieldDef<string, Schema.Top>,
        stateAtom,
        getOrCreateFieldAtoms,
        operations,
        arrayComponentMap,
        onBlurSubmitAtom
      )
    } else if (Field.isFieldDef(def)) {
      const fieldComponent = (componentMap as Record<string, React.FC<FieldComponentProps<any, any>>>)[key]
      if (fieldComponent === undefined) {
        throw new Error(`Missing field component for ${key}`)
      }
      components[key] = makeFieldComponent(
        key,
        def,
        getOrCreateFieldAtoms,
        fieldComponent,
        onBlurSubmitAtom
      )
    }
  }

  return components as FieldComponents<TFields, CM>
}

export const make = <
  TFields extends Field.FieldsRecord,
  R,
  A,
  E,
  SubmitArgs = void,
  CM extends FieldComponentMap<TFields> = FieldComponentMap<TFields>,
>(
  form: NeutralForm.Form<TFields, R, A, E, SubmitArgs>,
  options: { readonly fields: CM }
): BuiltForm<TFields, SubmitArgs, CM> => {
  const { atoms: formAtoms, fields } = form[NeutralForm.RendererInternals]
  const {
    autoSubmitAtom,
    getOrCreateFieldAtoms,
    keepAliveActiveAtom,
    mountAtom,
    onBlurSubmitAtom,
    operations,
    stateAtom,
    submitAtom,
    validateAtom
  } = formAtoms

  interface InternalFormContext {
    readonly formId: string
  }
  const FormContext = React.createContext<InternalFormContext | null>(null)

  const useRequiredContext = (component: "Form" | "Submit"): InternalFormContext => {
    const context = React.useContext(FormContext)
    if (context === null) {
      throw new Error(
        `${component} must be rendered inside the Provider returned by the same FormReact.make call`
      )
    }
    return context
  }

  const Provider: React.FC<ProviderProps<TFields>> = ({ children, defaultValues, validateOnInit }) => {
    const registry = React.useContext(RegistryContext)
    const state = useAtomValue(stateAtom)
    const setFormState = useAtomSet(stateAtom)
    const triggerValidate = useAtomSet(validateAtom)
    const [isInitialized, setIsInitialized] = React.useState(false)
    const formId = React.useId()
    const contextValue = React.useMemo(() => ({ formId }), [formId])

    React.useEffect(() => {
      const shouldInit = !registry.get(keepAliveActiveAtom) || Option.isNone(registry.get(stateAtom))
      if (shouldInit) {
        setFormState(Option.some(operations.createInitialState(defaultValues)))
        if (validateOnInit) triggerValidate()
      }
      setIsInitialized(true)
      // Defaults are intentionally read only when this Provider mounts.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [registry])

    useAtomMount(autoSubmitAtom)

    if (!isInitialized || Option.isNone(state)) return null
    return <FormContext.Provider value={contextValue}>{children}</FormContext.Provider>
  }

  const HtmlForm: React.FC<FormProps<SubmitArgs>> = (props) => {
    const { formId } = useRequiredContext("Form")
    const registry = React.useContext(RegistryContext)
    const submit = useAtomSet(submitAtom)
    const { getSubmitArgs, ...htmlProps } = props as FormProps<SubmitArgs> & {
      readonly getSubmitArgs?: (event: React.FormEvent<HTMLFormElement> & { readonly nativeEvent: SubmitEvent }) => SubmitArgs
    }

    const handleSubmit = React.useCallback((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (registry.get(submitAtom).waiting) return
      const args = getSubmitArgs === undefined
        ? undefined
        : getSubmitArgs(event as React.FormEvent<HTMLFormElement> & { readonly nativeEvent: SubmitEvent })
      submit(args as SubmitArgs)
    }, [getSubmitArgs, registry, submit])

    return <form {...htmlProps} id={formId} onSubmit={handleSubmit} />
  }

  const Submit: React.FC<SubmitProps> = ({ children }) => {
    const { formId } = useRequiredContext("Submit")
    const result = useAtomValue(submitAtom)
    const child = children as React.ReactElement<Record<string, unknown>>
    return React.cloneElement(child, {
      type: "submit",
      form: formId,
      disabled: child.props.disabled === true || result.waiting,
      "aria-disabled": child.props.disabled === true || result.waiting,
      "aria-busy": result.waiting,
      "data-waiting": result.waiting || undefined
    })
  }

  const fieldComponents = makeFieldComponents(
    fields,
    stateAtom,
    getOrCreateFieldAtoms,
    operations,
    options.fields,
    onBlurSubmitAtom
  )

  const KeepAlive: React.FC = () => {
    const setKeepAliveActive = useAtomSet(keepAliveActiveAtom)
    React.useLayoutEffect(() => {
      setKeepAliveActive(true)
      return () => setKeepAliveActive(false)
    }, [setKeepAliveActive])
    useAtomMount(mountAtom)
    return null
  }

  return {
    Provider,
    Form: HtmlForm,
    Submit,
    KeepAlive,
    ...fieldComponents
  }
}
