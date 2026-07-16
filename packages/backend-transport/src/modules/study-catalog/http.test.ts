import { PublicApi } from "@proxus/shared/public-api"
import { OpenApi } from "effect/unstable/httpapi"
import { describe, expect, test } from "vitest"
import { PublicStudyCatalogHandlers } from "./http.js"

describe("public study catalog transport", () => {
  test("builds handlers against the narrow API and exposes no admin operations", () => {
    expect(PublicStudyCatalogHandlers).toBeDefined()
    const document = OpenApi.fromApi(PublicApi)
    expect(document.paths["/study-catalog/countries"]?.get).toBeDefined()
    expect(Object.keys(document.paths).some((path) => path.startsWith("/admin/"))).toBe(false)
  })
})
