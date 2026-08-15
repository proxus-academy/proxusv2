// @effect-diagnostics asyncFunction:off anyUnknownInErrorContext:off unsafeEffectTypeAssertion:off
import * as Effect from "effect/Effect"
import { describe, expect, it } from "vitest"
import { composeProductionEdge, ProductionEdgeConfigurationError, type ProductionEdgeProps } from "./production-edge.ts"

const props = (): ProductionEdgeProps => ({
  project: "proxus-v2", domain: "app.example.com",
  website: { backendBucket: { name: "website", id: "website-id", selfLink: "backend-bucket-link" } },
  runtime: { publicApiLoadBalancer: { neg: "neg-link", backendService: "api-backend-link" } },
})
const harness = () => {
  const calls: Array<[string, string, any]> = []
  const component = (kind: string, result: any) => (id: string, p: any) => { calls.push([kind, id, p]); return Effect.succeed(result) }
  return { calls, components: {
    address: component("address", { address: "203.0.113.10", selfLink: "address-link" }),
    certificate: component("certificate", { selfLink: "certificate-link" }),
    urlMap: component("urlMap", { selfLink: "url-map-link" }),
    proxy: component("proxy", { selfLink: "proxy-link" }),
    forwardingRule: component("forwardingRule", {}),
  } }
}

describe("ProductionEdge", () => {
  it("composes the protected global HTTPS chain from website and runtime outputs", async () => {
    const h = harness()
    const output = await Effect.runPromise(composeProductionEdge(props(), h.components) as Effect.Effect<any, unknown, never>)
    expect(h.calls).toEqual([
      ["address", "ProductionEdge-Address", { project: "proxus-v2", name: "proxus-production", deletionProtection: true }],
      ["certificate", "ProductionEdge-Certificate", { project: "proxus-v2", name: "proxus-production", domains: ["app.example.com"], deletionProtection: true }],
      ["urlMap", "ProductionEdge-UrlMap", { project: "proxus-v2", name: "proxus-production", defaultBackendBucket: "backend-bucket-link", apiBackendService: "api-backend-link", deletionProtection: true }],
      ["proxy", "ProductionEdge-HttpsProxy", { project: "proxus-v2", name: "proxus-production", urlMap: "url-map-link", certificate: "certificate-link", deletionProtection: true }],
      ["forwardingRule", "ProductionEdge-HttpsForwardingRule", { project: "proxus-v2", name: "proxus-production-https", address: "address-link", target: "proxy-link", deletionProtection: true }],
    ])
    expect(output).toEqual({ address: "203.0.113.10", requiredDnsARecord: { name: "app.example.com", type: "A", address: "203.0.113.10" } })
  })

  it("fails before declaring resources when the runtime backend is unavailable", () => {
    const p = props()
    const h = harness()
    const withoutRuntime = { ...p, runtime: { publicApiLoadBalancer: undefined } }
    expect(() => composeProductionEdge(withoutRuntime, h.components)).toThrow(ProductionEdgeConfigurationError)
    expect(h.calls).toHaveLength(0)
  })

  it("rejects domains that cannot be used by the managed certificate", () => {
    expect(() => composeProductionEdge({ ...props(), domain: "HTTPS://Example.com" }, harness().components)).toThrow("domain must be a valid lowercase DNS name")
  })
})
