export const internalWebRoutes = {
  pricing: "/pricing",
  blog: "/blog",
  careers: "/careers",
  contact: "/contact",
  support: "/support",
} as const

const localWebappUrl = "http://localhost:5173/es"

export const resolveWebappUrl = (
  configuredUrl: string | undefined,
  production = false,
): string => {
  const value = configuredUrl ?? (production ? undefined : localWebappUrl)
  if (value === undefined || value === "") throw new Error("PUBLIC_WEBAPP_URL is required")

  const url = new URL(value)
  if (production && url.protocol !== "https:") throw new Error("PUBLIC_WEBAPP_URL must use HTTPS in production")
  if (url.username !== "" || url.password !== "") throw new Error("PUBLIC_WEBAPP_URL must not contain credentials")
  return url.href
}
