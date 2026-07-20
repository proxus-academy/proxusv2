import { describe, expect, it } from "vitest"
import { OpenApi } from "effect/unstable/httpapi"
import { AdminApi } from "./admin-api.js"
import { ProxusApi } from "./api.js"
import { PublicApi } from "./public-api.js"

describe("API roots", () => {
  it("keeps public and admin routes in separate contracts", () => {
    const publicDocument = OpenApi.fromApi(PublicApi)
    const adminDocument = OpenApi.fromApi(AdminApi)

    expect(publicDocument.paths["/study-catalog/countries"]?.get).toBeDefined()
    expect(publicDocument.paths["/admin/study-catalog/nodes"]).toBeUndefined()
    const listNodes = adminDocument.paths["/admin/study-catalog/nodes"]?.get
    expect(listNodes).toBeDefined()
    expect(listNodes?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "kind", in: "query", required: true }),
      expect.objectContaining({ name: "status", in: "query", required: true }),
    ]))
    expect(adminDocument.paths["/admin/study-catalog/nodes/{nodeId}/status"]?.patch).toBeDefined()
    expect(adminDocument.paths["/admin/study-catalog/nodes/{nodeId}/archive"]).toBeUndefined()
    expect(adminDocument.paths["/study-catalog/countries"]).toBeUndefined()
  })

  it("derives the tooling contract from both narrow roots without duplicate groups", () => {
    const document = OpenApi.fromApi(ProxusApi)
    const expectedGroups = [...new Set([
      ...Object.keys(PublicApi.groups),
      ...Object.keys(AdminApi.groups),
    ])].sort()

    expect(Object.keys(ProxusApi.groups).sort()).toEqual(expectedGroups)
    expect(document.info.title).toBe("Proxus API")
    expect(document.paths["/study-catalog/countries"]?.get).toBeDefined()
    expect(document.paths["/feature-flags/snapshot"]?.get).toBeDefined()
    expect(document.paths["/product-analytics/events"]?.post).toBeDefined()
    expect(document.paths["/study-catalog/nodes/{nodeId}"]?.get).toBeDefined()
    expect(document.paths["/study-catalog/nodes/children"]?.get).toBeDefined()
    expect(
      document.paths["/study-catalog/nodes/children/{nodeId}"]?.get,
    ).toBeDefined()
    expect(
      document.paths["/study-catalog/nodes/{nodeId}/targets"]?.get,
    ).toBeDefined()
    expect(document.paths["/admin/study-catalog/nodes"]?.get).toBeDefined()
    expect(document.paths["/admin/study-catalog/nodes"]?.post).toBeDefined()
    expect(
      document.paths["/admin/study-catalog/edges/{edgeId}"]?.patch,
    ).toBeDefined()
    expect(
      document.paths["/admin/study-catalog/edges/{edgeId}"]?.delete,
    ).toBeDefined()
  })

  it("documents typed status codes for catalog mutations", () => {
    const document = OpenApi.fromApi(ProxusApi)
    const connect = document.paths["/admin/study-catalog/edges"]?.post

    expect(connect?.responses["201"]).toBeDefined()
    expect(connect?.responses["404"]).toBeDefined()
    expect(connect?.responses["409"]).toBeDefined()
    expect(connect?.responses["422"]).toBeDefined()
    expect(connect?.responses["500"]).toBeDefined()
  })
})
