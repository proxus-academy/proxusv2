import { createProductI18n, type Locale } from "@proxus/product-messages"

const instances = new Map<Locale, ReturnType<typeof createProductI18n>>()

export const productI18nFor = (locale: Locale) => {
  const current = instances.get(locale)
  if (current !== undefined) return current
  const created = createProductI18n(locale)
  instances.set(locale, created)
  return created
}
