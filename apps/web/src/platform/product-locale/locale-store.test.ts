// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest"
import { browserDeviceLocale, clearBrowserLocalePreference, persistBrowserLocale, preferredBrowserLocale } from "./locale-store.js"

beforeEach(() => localStorage.clear())

describe("browser locale preference", () => {
  it("normalizes device languages and defaults safely", () => {
    expect(browserDeviceLocale(["fr-FR", "en-GB"])).toBe("en")
    expect(browserDeviceLocale(["fr-FR"])).toBe("es")
  })

  it("persists and clears preference without touching History", () => {
    const before = location.href
    persistBrowserLocale("en")
    expect(preferredBrowserLocale()).toBe("en")
    clearBrowserLocalePreference()
    expect(location.href).toBe(before)
  })
})
