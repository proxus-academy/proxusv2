import { describe, expect, it } from "vitest"
import { makeWebappConfig } from "../config.js"
import { resolveWebappAssetUrl } from "./assets.js"

describe("Webapp public assets", () => {
  it("resolves typed assets from the configured Web origin", () => {
    const config = makeWebappConfig({
      VITE_WEB_URL: "https://proxus.app",
      VITE_ASSET_BASE_URL: "https://proxus.app",
    }, true)
    expect(resolveWebappAssetUrl("brand.logo", config, new URL("https://app.proxus.app/es")).href)
      .toBe("https://proxus.app/assets/brand/logo.svg")
  })
})
