// @effect-diagnostics asyncFunction:off anyUnknownInErrorContext:off missingEffectContext:off unsafeEffectTypeAssertion:off
import * as Effect from "effect/Effect"
import { describe, expect, it, vi } from "vitest"
import { fakeResource } from "../test-resource.ts"
import { composeProductionRuntime, ProductionRuntimeConfigurationError, type ProductionRuntimeProps } from "./production-runtime.ts"

const digest = (name: string) => `europe-southwest1-docker.pkg.dev/proxus-v2/proxus/${name}@sha256:${"a".repeat(64)}`
const props = (deployServices: boolean): ProductionRuntimeProps => ({
  deployServices,
  foundation: { project: {} as ProductionRuntimeProps["foundation"]["project"], projectId: "proxus-v2", projectNumber: "123456", location: "europe-southwest1", productionDeployer: "serviceAccount:deploy@proxus-v2.iam.gserviceaccount.com" },
  images: { publicApi: digest("server"), adminApi: digest("admin-server"), adminWeb: digest("admin-web") },
  secrets: { database: { name: "DATABASE_URL", secretId: "database" }, authSigning: { name: "AUTH_GOOGLE_SIGNING_SECRET", secretId: "auth" }, objectStorageSigning: { name: "OBJECT_STORAGE_SIGNING_SECRET", secretId: "objects" }, mailgunApiKey: { name: "MAILGUN_API_KEY", secretId: "mailgun" } },
  analytics: { project: "proxus-v2", dataset: "analytics", table: "events" }, mailgun: { domain: "mail.example.com", from: "Proxus <hello@example.com>" }, iapAccessPrincipal: "group:admins@example.com",
})
const harness = () => {
  const calls: { identity: any[]; migration: any[]; publicService: any[]; iapService: any[]; neg: any[]; backend: any[] } = { identity: [], migration: [], publicService: [], iapService: [], neg: [], backend: [] }
  return { calls, components: {
    identity: (p: any) => { calls.identity.push(p); return Effect.succeed({ email: `${p.accountId}@proxus-v2.iam.gserviceaccount.com`, name: p.accountId, dependencies: [fakeResource(`identity:${p.accountId}`)] }) },
    migration: (p: any) => { calls.migration.push(p); return Effect.succeed({ resource: fakeResource(`job:${p.name}`), project: p.project, location: p.location, name: p.name, resourceName: `projects/${p.project}/locations/${p.location}/jobs/${p.name}` }) },
    publicService: (_id: string, p: any) => { calls.publicService.push(p); return Effect.succeed({ name: p.name, resourceName: `services/${p.name}`, uri: "https://public.run" }) },
    iapService: (p: any) => { calls.iapService.push(p); return Effect.succeed({ resource: fakeResource(`job:${p.name}`), project: p.project, location: p.location, name: p.name, resourceName: `services/${p.name}`, uri: "https://admin.run" }) },
    neg: (_id: string, p: any) => { calls.neg.push(p); return Effect.succeed({ selfLink: "neg-link" }) },
    backend: (_id: string, p: any) => { calls.backend.push(p); return Effect.succeed({ selfLink: "backend-link" }) },
  } }
}

describe("ProductionRuntime", () => {
  it("always creates three least-privilege identities and the digest-pinned migration job, but gates services", async () => {
    const h = harness(); const out = await Effect.runPromise(composeProductionRuntime(props(false), h.components) as Effect.Effect<any, unknown, never>)
    expect(h.calls.identity.map((x) => [x.accountId, x.secretIds, x.bigQueryDataset])).toEqual([
      ["proxus-production-public", ["database", "auth", "objects", "mailgun"], "projects/proxus-v2/datasets/analytics"],
      ["proxus-production-admin", ["database", "auth", "objects", "mailgun"], "projects/proxus-v2/datasets/analytics"],
      ["proxus-production-migrations", ["database"], undefined],
    ])
    expect(h.calls.migration[0]).toMatchObject({ name: "proxus-production-migrations", image: digest("server"), databaseBinding: { access: "ddl" } })
    expect(h.calls.publicService).toHaveLength(0); expect(h.calls.iapService).toHaveLength(0)
    expect(out).toMatchObject({ publicApi: undefined, admin: undefined, publicApiLoadBalancer: undefined })
  })

  it("composes protected LB-only public API and multi-container direct-IAP Admin", async () => {
    const h = harness(); const out = await Effect.runPromise(composeProductionRuntime(props(true), h.components) as Effect.Effect<any, unknown, never>)
    expect(h.calls.publicService[0]).toMatchObject({ deletionProtection: true, ingress: "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER", invokerIamDisabled: true, iapEnabled: false })
    expect(h.calls.publicService[0].template.containers[0].image).toBe(digest("server"))
    expect(h.calls.neg[0]).toMatchObject({ cloudRunService: "proxus-production-public-api", deletionProtection: true })
    expect(h.calls.backend[0]).toMatchObject({ group: "neg-link", deletionProtection: true })
    expect(h.calls.iapService[0]).toMatchObject({ accessPrincipal: "group:admins@example.com", deletionPolicy: "retain", maxInstances: 3 })
    expect(h.calls.iapService[0].containers.map((x: any) => [x.name, x.image])).toEqual([["frontend", digest("admin-web")], ["public-api", digest("server")], ["admin-api", digest("admin-server")]])
    expect(out).toMatchObject({ publicApi: { url: "https://public.run" }, publicApiLoadBalancer: { neg: "neg-link", backendService: "backend-link" }, admin: { url: "https://admin.run" } })
  })

  it("rejects malformed secret contracts before declaring resources", () => {
    const bad = props(false); (bad.secrets.database as any).name = "URL"
    expect(() => composeProductionRuntime(bad, harness().components)).toThrow(ProductionRuntimeConfigurationError)
  })
})
