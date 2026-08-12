import { createFileRoute, Outlet } from "@tanstack/react-router"
import { ProductLocaleProvider } from "../platform/product-locale/paraglide-react.js"
import { DownloadAppPage } from "../modules/download-app-screen.js"
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
    <ProductLocaleProvider locale={locale}>
      {desktop ? <Outlet /> : <DownloadAppPage />}
    </ProductLocaleProvider>
  )
}
