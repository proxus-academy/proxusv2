import { createFileRoute, Outlet } from "@tanstack/react-router"
import { I18nextProvider } from "react-i18next"
import { DownloadAppPage } from "../modules/download-app-screen.js"
import { productI18nFor } from "../platform/product-locale/index.js"
import { useDesktopViewport } from "../platform/viewport/index.js"
import { parseLocaleParam } from "./__root.js"

export const Route = createFileRoute("/$locale")({
  params: {
    parse: ({ locale }) => ({ locale: parseLocaleParam(locale) }),
    stringify: ({ locale }) => ({ locale }),
  },
  component: LocaleLayout,
})

function LocaleLayout() {
  const { locale } = Route.useParams()
  const desktop = useDesktopViewport()
  document.documentElement.lang = locale
  document.documentElement.dir = "ltr"
  return (
    <I18nextProvider i18n={productI18nFor(locale)}>
      {desktop ? <Outlet /> : <DownloadAppPage />}
    </I18nextProvider>
  )
}
