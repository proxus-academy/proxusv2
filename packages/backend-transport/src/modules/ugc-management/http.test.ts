import { PublicApi } from "@proxus/shared/public-api"
import { OpenApi } from "effect/unstable/httpapi"
import { describe, expect, test } from "vitest"
import { PublicUgcHandlers } from "./http.js"

describe("public UGC transport", () => {
  test("builds the authenticated UGC surface without administrative routes", () => {
    expect(PublicUgcHandlers).toBeDefined()
    const document = OpenApi.fromApi(PublicApi)
    expect(document.paths["/ugc/workspace"]?.get).toBeDefined()
    expect(document.paths["/ugc/commands"]?.post).toBeDefined()
    expect(Object.keys(document.paths).some((path) => path.startsWith("/admin/ugc"))).toBe(false)
  })
})
