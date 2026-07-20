import { describe, expect, it } from "vitest"
import { apiProxyConfig } from "../vite.config.js"

describe("mobile web Vite API proxy", () => {
  it("strips only the browser /api base and preserves the request origin", () => {
    expect(apiProxyConfig.changeOrigin).toBe(false)
    expect(apiProxyConfig.rewrite("/api/product-analytics/events?batch=one")).toBe(
      "/product-analytics/events?batch=one",
    )
  })
})
