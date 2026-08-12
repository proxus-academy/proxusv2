import type { Locale } from "@proxus/product-messages"
import { cloneElement, createContext, type ReactElement, type ReactNode, useContext } from "react"
import { m } from "../../paraglide/messages.js"

type Namespace = "common" | "auth" | "errors" | "registration" | "validation"
type MessageInputs = Readonly<Record<string, unknown>>
type TranslationOptions = MessageInputs & { readonly ns?: Namespace }
const LocaleContext = createContext<Locale>("es")

export function ProductLocaleProvider({ locale, children }: Readonly<{ locale: Locale; children: ReactNode }>) {
  return <LocaleContext value={locale}>{children}</LocaleContext>
}

const messageName = (namespace: Namespace, keyPrefix: string | undefined, key: string) =>
  namespace === "validation"
    ? `${namespace}_${key}`
    : [namespace, keyPrefix, key].filter(Boolean).join("_").replaceAll(".", "_")

export function useTranslation(namespace: Namespace | readonly Namespace[] = "common", options?: { readonly keyPrefix?: string }) {
  const locale = useContext(LocaleContext)
  const defaultNamespace = typeof namespace === "string" ? namespace : (namespace[0] ?? "common")

  return {
    i18n: { language: locale },
    t(key: string, inputs: TranslationOptions = {}) {
      const selectedNamespace = inputs.ns ?? defaultNamespace
      const candidate: unknown = Reflect.get(m, messageName(selectedNamespace, options?.keyPrefix, key))
      if (typeof candidate !== "function") throw new Error(`Unknown product message: ${selectedNamespace}:${key}`)
      const { ns: _, ...parameters } = inputs
      const translated: unknown = Reflect.apply(candidate, undefined, [parameters, { locale }])
      if (typeof translated !== "string") throw new Error(`Invalid product message: ${selectedNamespace}:${key}`)
      return translated
    },
  }
}

export function Trans({ t, i18nKey, components }: Readonly<{
  t: (key: string) => string
  i18nKey: string
  components: Readonly<Record<string, ReactElement>>
}>) {
  const text = t(i18nKey)
  const pattern = /<([a-zA-Z][\w-]*)>(.*?)<\/\1>/g
  const output: ReactNode[] = []
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index
    output.push(text.slice(cursor, index))
    const tag = match[1] ?? ""
    const content = match[2] ?? ""
    const component = components[tag]
    output.push(component === undefined ? content : cloneElement(component, { key: `${tag}-${index}` }, content))
    cursor = index + match[0].length
  }
  output.push(text.slice(cursor))
  return <>{output}</>
}
