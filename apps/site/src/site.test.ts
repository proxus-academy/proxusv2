import { describe, expect, it } from "vitest"
import * as m from "./paraglide/messages.js"
import { overwriteGetLocale } from "./paraglide/runtime.js"
import {
  canonicalSitePath,
  internalSiteRoutes,
  localizeSitePath,
  resolveProductUrl,
} from "./site-config.js"

describe("public site configuration", () => {
  it("compiles the public copy for both supported locales", () => {
    overwriteGetLocale(() => "es")
    expect(m.site_homeHeadingHighlight()).toBe("mejor de estudiar")

    overwriteGetLocale(() => "en")
    expect(m.site_homeHeadingHighlight()).toBe("better way to study")
  })

  it("uses the local product when no deployment URL is configured", () => {
    expect(resolveProductUrl(undefined)).toBe("http://localhost:5173")
    expect(resolveProductUrl(undefined, "en")).toBe("http://localhost:5173/en")
  })

  it("uses the configured product origin", () => {
    expect(resolveProductUrl("https://app.proxus.es/es")).toBe("https://app.proxus.es")
    expect(resolveProductUrl("https://preview.example/app", "en")).toBe(
      "https://preview.example/app/en",
    )
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

  it("localizes site routes while keeping Spanish canonical URLs unprefixed", () => {
    expect(localizeSitePath("/pricing", "es")).toBe("/pricing")
    expect(localizeSitePath("/pricing", "en")).toBe("/en/pricing")
    expect(localizeSitePath("/", "en")).toBe("/en")
  })

  it("maps localized URLs back to their canonical site path", () => {
    expect(canonicalSitePath("/pricing")).toBe("/pricing")
    expect(canonicalSitePath("/en/pricing")).toBe("/pricing")
    expect(canonicalSitePath("/en")).toBe("/")
  })
})
