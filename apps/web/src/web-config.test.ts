import { describe, expect, it } from "vitest"
import { internalWebRoutes, resolveWebappUrl } from "./web-config.js"

describe("public site configuration", () => {
  it("uses the local product when no deployment URL is configured", () => {
    expect(resolveWebappUrl(undefined)).toBe("http://localhost:5173/es")
  })

  it("uses the configured product origin", () => {
    expect(resolveWebappUrl("https://app.proxus.es/es")).toBe("https://app.proxus.es/es")
  })

  it("fails the production build without a secure Webapp URL", () => {
    expect(() => resolveWebappUrl(undefined, true)).toThrow("PUBLIC_WEBAPP_URL is required")
    expect(() => resolveWebappUrl("http://app.proxus.es", true)).toThrow("must use HTTPS")
  })

  it("keeps public destinations rooted in the static site", () => {
    expect(Object.values(internalWebRoutes)).toEqual([
      "/pricing",
      "/blog",
      "/careers",
      "/contact",
      "/support",
    ])
  })
})
