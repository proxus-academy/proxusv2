import { describe, expect, it } from "vitest"
import { apiProxyConfig } from "../vite.config.js"

describe("web Vite API proxy", () => {
  it("strips only the browser /api base and preserves the request origin", () => {
    expect(apiProxyConfig.changeOrigin).toBe(false)
    expect(apiProxyConfig.rewrite("/api/feature-flags/snapshot?revision=7")).toBe(
      "/feature-flags/snapshot?revision=7",
    )
  })
})
