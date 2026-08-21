import { describe, expect, it } from "vitest"
import { asset, resolveAssetUrl, type AssetId } from "./index.js"

describe("public asset catalog", () => {
  it("resolves a typed asset against its configured public origin", () => {
    const id: AssetId = "product.tool.tests"
    expect(resolveAssetUrl(id, new URL("https://proxus.app")).href)
      .toBe("https://proxus.app/assets/product/tools/tests.webp")
  })

  it("exposes intrinsic dimensions", () => {
    expect(asset("brand.logo")).toMatchObject({ width: 1080, height: 729 })
  })
})
