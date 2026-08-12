import { Locale } from "@proxus/product-messages"
import { Heading } from "@proxus/ui"
import { createRootRoute, Navigate, notFound, Outlet } from "@tanstack/react-router"
import { Option, Schema } from "effect"
import { useTranslation } from "react-i18next"
import { preferredBrowserLocale } from "../platform/product-locale/index.js"

export const Route = createRootRoute({
  component: Outlet,
  notFoundComponent: RootRedirect,
  errorComponent: RouteError,
  validateSearch: (search): Readonly<Record<string, unknown>> => search,
})

function RootRedirect() {
  return (
    <Navigate
      to="/$locale"
      params={{ locale: preferredBrowserLocale() }}
      replace
    />
  )
}

function RouteError() {
  const { t } = useTranslation("common")
  return (
    <main>
      <Heading level={1}>{t("routeError")}</Heading>
    </main>
  )
}

export const parseLocaleParam = (locale: string) => {
  const decoded = Schema.decodeUnknownOption(Locale)(locale)
  if (Option.isNone(decoded)) throw notFound()
  return decoded.value
}
