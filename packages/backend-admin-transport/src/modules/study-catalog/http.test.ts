import { AdminApi } from "@proxus/shared/admin-api"
import { OpenApi } from "effect/unstable/httpapi"
import { describe, expect, test } from "vitest"
import { AdminStudyCatalogHandlers } from "./http.js"

describe("administrative study catalog transport", () => {
  test("builds handlers against the narrow API and exposes no public operations", () => {
    expect(AdminStudyCatalogHandlers).toBeDefined()
    const document = OpenApi.fromApi(AdminApi)
    expect(document.paths["/admin/study-catalog/nodes"]?.post).toBeDefined()
    expect(document.paths["/admin/study-catalog/nodes/{nodeId}/status"]?.patch).toBeDefined()
    expect(document.paths["/admin/study-catalog/nodes/{nodeId}/archive"]).toBeUndefined()
    const listParameters = document.paths["/admin/study-catalog/nodes"]?.get?.parameters ?? []
    expect(listParameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "kind", in: "query", required: true }),
      expect.objectContaining({ name: "status", in: "query", required: true }),
    ]))
    expect(Object.keys(document.paths).some((path) => path.startsWith("/study-catalog/"))).toBe(false)
  })
})
