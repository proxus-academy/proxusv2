import { createProductI18n, type Locale } from "@proxus/product-messages"
import type { ReactNode } from "react"
import { I18nextProvider } from "react-i18next"

export const ProductI18nTestProvider = ({ children, locale = "es" }: {
  readonly children: ReactNode
  readonly locale?: Locale
}) => <I18nextProvider i18n={createProductI18n(locale)}>{children}</I18nextProvider>
