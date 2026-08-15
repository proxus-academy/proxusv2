// @effect-diagnostics asyncFunction:off anyUnknownInErrorContext:off missingEffectContext:off unsafeEffectTypeAssertion:off
import * as Effect from "effect/Effect"
import { describe, expect, it } from "vitest"
import { composeProductionWebsite, ProductionWebsiteConfigurationError, type ProductionWebsiteProps } from "./production-website.ts"

const hash = (character: string) => character.repeat(64)
const props = (): ProductionWebsiteProps => ({
  project: "proxus-v2", bucketName: "proxus-production-web", bucketLocation: "EU",
  manifest: { files: [
    { name: "assets/app.js", path: "/artifact/assets/app.js", sha256: hash("a"), size: 12 },
    { name: "index.html", path: "/artifact/index.html", sha256: hash("b"), size: 42 },
    { name: "assets/font.woff2", path: "/artifact/assets/font.woff2", sha256: hash("c"), size: 7 },
  ] },
})
const harness = () => {
  const calls: { bucket: any[]; object: any[]; identity: any[]; iam: any[]; backend: any[] } = { bucket: [], object: [], identity: [], iam: [], backend: [] }
  return { calls, components: {
    bucket: (id: string, p: any) => { calls.bucket.push([id, p]); return Effect.succeed({ name: p.name }) },
    object: (id: string, p: any) => { calls.object.push([id, p]); return Effect.succeed({ ...p, generation: "1" }) },
    identity: (id: string, p: any) => { calls.identity.push([id, p]); return Effect.succeed({ email: "service-123@cloud-cdn-fill.iam.gserviceaccount.com", member: "serviceAccount:service-123@cloud-cdn-fill.iam.gserviceaccount.com" }) },
    iam: (id: string, p: any) => { calls.iam.push([id, p]); return Effect.void },
    backend: (id: string, p: any) => { calls.backend.push([id, p]); return Effect.succeed({ name: p.name, id: "backend-id", selfLink: "backend-link" }) },
  } }
}

describe("ProductionWebsite", () => {
  it("composes a protected private origin, hashed manifest objects, CDN identity IAM and backend bucket", async () => {
    const h = harness()
    const output = await Effect.runPromise(composeProductionWebsite(props(), h.components) as Effect.Effect<any, unknown, never>)
    expect(h.calls.bucket[0][1]).toEqual({ project: "proxus-v2", name: "proxus-production-web", location: "EU", deletionProtection: true })
    expect(h.calls.object.map(([id, p]) => [id, p.name, p.contentType, p.cacheControl])).toEqual([
      [expect.stringMatching(/^ProductionWebsite-Object-a{16}-[a-f0-9]{8}$/), "assets/app.js", "text/javascript; charset=utf-8", "public, max-age=31536000, immutable"],
      [expect.stringMatching(/^ProductionWebsite-Object-c{16}-[a-f0-9]{8}$/), "assets/font.woff2", "font/woff2", "public, max-age=31536000, immutable"],
      [expect.stringMatching(/^ProductionWebsite-Object-b{16}-[a-f0-9]{8}$/), "index.html", "text/html; charset=utf-8", "no-cache, max-age=0"],
    ])
    expect(h.calls.object[0][1].source).toEqual({ path: "/artifact/assets/app.js", sha256: hash("a"), size: 12 })
    expect(h.calls.identity[0][1]).toEqual({ project: "proxus-v2", service: "cloudcdn.googleapis.com" })
    expect(h.calls.iam[0][1]).toEqual({ bucket: "proxus-production-web", role: "roles/storage.objectViewer", member: "serviceAccount:service-123@cloud-cdn-fill.iam.gserviceaccount.com" })
    expect(h.calls.backend[0][1]).toMatchObject({ bucketName: "proxus-production-web", deletionProtection: true })
    expect(output).toMatchObject({ bucketName: "proxus-production-web", backendBucket: { id: "backend-id" }, objects: [{ sha256: hash("a") }, { sha256: hash("c") }, { sha256: hash("b") }] })
  })

  it("validates the precomputed descriptor without touching source files", async () => {
    const h = harness()
    const p = props()
    const manifest = { files: p.manifest.files.map((file, index) => index === 0 ? { ...file, path: "/does/not/exist" } : file) }
    await expect(Effect.runPromise(composeProductionWebsite({ ...p, manifest }, h.components) as Effect.Effect<any, unknown, never>)).resolves.toBeDefined()
  })

  it.each([
    [{ files: [{ name: "../index.html", path: "x", sha256: hash("a"), size: 1 }] }, "invalid artifact path"],
    [{ files: [{ name: "index.html", path: "x", sha256: "bad", size: 1 }] }, "invalid sha256"],
    [{ files: [{ name: "app.ts", path: "x", sha256: hash("a"), size: 1 }] }, "must contain index.html"],
  ])("rejects an unsafe manifest", (manifest, message) => {
    expect(() => composeProductionWebsite({ ...props(), manifest }, harness().components)).toThrowError(ProductionWebsiteConfigurationError)
    expect(() => composeProductionWebsite({ ...props(), manifest }, harness().components)).toThrow(message)
  })
})
