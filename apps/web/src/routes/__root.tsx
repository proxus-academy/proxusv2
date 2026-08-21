import { common_routeError } from "../paraglide/messages.js"
import { Box, Heading } from "@proxus/ui"
import { createRootRoute, Outlet } from "@tanstack/react-router"
import { useEffect } from "react"
import { getLocale, getTextDirection } from "../paraglide/runtime.js"
import { DownloadAppPage } from "../modules/download-app-screen.js"
import { useDesktopViewport } from "../platform/viewport/index.js"

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: RouteError,
  validateSearch: (search): Readonly<Record<string, unknown>> => search,
})

function RootLayout() {
  const locale = getLocale()
  const desktop = useDesktopViewport()
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = getTextDirection(locale)
  }, [locale])
  return desktop ? <Outlet /> : <DownloadAppPage />
}

function RouteError() {
  return <Box as="main"><Heading level={1}>{common_routeError()}</Heading></Box>
}
