import { describe, expect, it } from "vitest"
import { internalSiteRoutes, resolveProductUrl } from "./site-config.js"

describe("public site configuration", () => {
  it("uses the local product when no deployment URL is configured", () => {
    expect(resolveProductUrl(undefined)).toBe("http://localhost:5173/es")
  })

  it("uses the configured product origin", () => {
    expect(resolveProductUrl("https://app.proxus.es/es")).toBe("https://app.proxus.es/es")
  })

  it("keeps public destinations rooted in the static site", () => {
    expect(Object.values(internalSiteRoutes)).toEqual([
      "/pricing",
      "/blog",
      "/careers",
      "/contact",
      "/support",
    ])
  })
})
