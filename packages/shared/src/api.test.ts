import { describe, expect, it } from "vitest"
import { OpenApi } from "effect/unstable/httpapi"
import { ProxusApi } from "./api.js"

describe("ProxusApi", () => {
  it("generates separate public and admin study catalog contracts", () => {
    const document = OpenApi.fromApi(ProxusApi)

    expect(document.info.title).toBe("Proxus API")
    expect(document.paths["/study-catalog/nodes/{nodeId}"]?.get).toBeDefined()
    expect(
      document.paths["/study-catalog/nodes/{nodeId}/targets"]?.get,
    ).toBeDefined()
    expect(document.paths["/admin/study-catalog/nodes"]?.post).toBeDefined()
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
