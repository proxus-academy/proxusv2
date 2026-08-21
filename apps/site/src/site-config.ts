export const internalSiteRoutes = {
  pricing: "/pricing",
  blog: "/blog",
  careers: "/careers",
  contact: "/contact",
  support: "/support",
} as const

export type SiteLocale = "es" | "en"

export const toSiteLocale = (locale: string | undefined): SiteLocale =>
  locale === "en" ? "en" : "es"

export const localizeSitePath = (path: string, locale: SiteLocale) => {
  const normalizedPath = path === "/" ? "" : `/${path.replace(/^\/+|\/+$/g, "")}`
  return locale === "es"
    ? normalizedPath === "" ? "/" : normalizedPath
    : `/en${normalizedPath}`
}

export const canonicalSitePath = (pathname: string) => {
  const withoutLocale = pathname.replace(/^\/en(?=\/|$)/, "")
  return withoutLocale || "/"
}

export const resolveProductUrl = (
  configuredUrl: string | undefined,
  locale: SiteLocale = "es",
) => {
  const configuredBase = configuredUrl ?? "http://localhost:5173"
  const base = configuredBase.replace(/\/(?:es|en)\/?$/, "").replace(/\/$/, "")
  return locale === "es" ? base : `${base}/en`
}
