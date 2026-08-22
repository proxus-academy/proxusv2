import { AdminApi } from "@proxus/shared/admin-api"
import { OpenApi } from "effect/unstable/httpapi"
import { describe, expect, test } from "vitest"
import { AdminUgcHandlers } from "./http.js"

describe("administrative UGC transport", () => {
  test("builds the administrative UGC surface without public routes", () => {
    expect(AdminUgcHandlers).toBeDefined()
    const document = OpenApi.fromApi(AdminApi)
    expect(document.paths["/admin/ugc/workspace"]?.get).toBeDefined()
    expect(document.paths["/admin/ugc/commands"]?.post).toBeDefined()
    expect(document.paths["/ugc/workspace"]).toBeUndefined()
  })
})
