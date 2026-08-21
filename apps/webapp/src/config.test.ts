import { describe, expect, it } from "vitest"
import { makeWebappConfig, resolveRuntimeBaseUrl } from "./config.js"

describe("Webapp public URL configuration", () => {
  it("provides local development defaults", () => {
    expect(makeWebappConfig({}, false).webUrl.href).toBe("http://localhost:4321/")
  })

  it("fails production configuration early", () => {
    expect(() => makeWebappConfig({}, true)).toThrow("VITE_WEB_URL is required")
    expect(() => makeWebappConfig({
      VITE_WEB_URL: "https://proxus.app",
      VITE_ASSET_BASE_URL: "http://proxus.app",
    }, true)).toThrow("VITE_ASSET_BASE_URL must use HTTPS")
  })

  it("supports same-origin preview assets without baking the preview hostname", () => {
    const config = makeWebappConfig({
      VITE_WEB_URL: "https://proxus.app",
      VITE_ASSET_BASE_URL: "/",
    }, true)
    expect(resolveRuntimeBaseUrl(config.assetBaseUrl, new URL("https://preview.example/es")))
      .toEqual(new URL("https://preview.example/"))
  })
})
