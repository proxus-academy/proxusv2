export const internalSiteRoutes = {
  pricing: "/pricing",
  blog: "/blog",
  careers: "/careers",
  contact: "/contact",
  support: "/support",
} as const

export const resolveProductUrl = (configuredUrl: string | undefined) =>
  configuredUrl ?? "http://localhost:5173/es"
