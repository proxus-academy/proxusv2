import type { Locale } from "@proxus/product-messages"
import type { ReactNode } from "react"
import { ProductLocaleProvider } from "../platform/product-locale/paraglide-react.js"

export const ProductI18nTestProvider = ({ children, locale = "es" }: {
  readonly children: ReactNode
  readonly locale?: Locale
}) => <ProductLocaleProvider locale={locale}>{children}</ProductLocaleProvider>
