// @effect-diagnostics nodeBuiltinImport:off asyncFunction:off strictEffectProvide:off
// eslint-disable-next-line no-restricted-imports -- Test-owned temporary directory setup and teardown stays outside the adapter under test.
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
// eslint-disable-next-line no-restricted-imports -- Test-owned temporary directory setup and teardown stays outside the adapter under test.
import { join } from "node:path"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { afterEach, describe, expect, test } from "vitest"
import { ObjectStorage } from "./object-storage.js"
import { httpLayer } from "./object-storage.local.http.js"
import { layer } from "./object-storage.local.js"

const disposals: Array<() => Promise<void>> = []
afterEach(async () => {
  await Promise.all(disposals.splice(0).map((dispose) => dispose()))
})

const makeHarness = async () => {
  const root = await mkdtemp(join(tmpdir(), "proxus-object-http-"))
  const storageLive = layer({
    root,
    publicBaseUrl: "http://proxus.test",
    signingSecret: "a-test-secret-with-at-least-32-characters",
  }).pipe(Layer.provide([NodeFileSystem.layer, NodePath.layer]))
  const routes = httpLayer().pipe(
    Layer.provide(storageLive),
    Layer.provide(HttpServer.layerServices),
  )
  const web = HttpRouter.toWebHandler(routes, { disableLogger: true })
  disposals.push(async () => {
    await web.dispose()
    await rm(root, { recursive: true, force: true })
  })

  const targets = await Effect.runPromise(Effect.gen(function*() {
    const storage = yield* ObjectStorage
    const upload = yield* storage.createUploadTarget({
      key: "assets/uploaded.webp",
      contentType: "image/webp",
      maxContentLength: 4,
      expiresIn: 60_000,
    })
    const download = yield* storage.createDownloadTarget({
      key: "assets/uploaded.webp",
      expiresIn: 60_000,
    })
    return { upload, download }
  }).pipe(Effect.provide(storageLive)))

  return { web, ...targets }
}

describe("LocalObjectStorage HTTP routes", () => {
  test("uploads, downloads, and exposes a stable public URL", async () => {
    const { web, upload, download } = await makeHarness()
    const uploaded = await web.handler(new Request(upload.url, {
      method: upload.method,
      headers: upload.headers,
      body: new Uint8Array([1, 2, 3, 4]),
    }))
    expect(uploaded.status).toBe(201)

    const downloaded = await web.handler(new Request(download.url))
    expect(downloaded.status).toBe(200)
    expect(downloaded.headers.get("content-type")).toBe("image/webp")
    expect(Array.from(new Uint8Array(await downloaded.arrayBuffer()))).toEqual([1, 2, 3, 4])

    const publicResponse = await web.handler(
      new Request("http://proxus.test/objects/assets/uploaded.webp"),
    )
    expect(publicResponse.status).toBe(200)
    expect(publicResponse.headers.get("cache-control")).toContain("immutable")

    const head = await web.handler(new Request(
      "http://proxus.test/objects/assets/uploaded.webp",
      { method: "HEAD" },
    ))
    expect(head.status).toBe(200)
    expect(head.headers.get("content-length")).toBe("4")
    expect(await head.text()).toBe("")
  })

  test("enforces the signed content type and streamed size limit", async () => {
    const first = await makeHarness()
    const wrongType = await first.web.handler(new Request(first.upload.url, {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: new Uint8Array([1]),
    }))
    expect(wrongType.status).toBe(415)

    const second = await makeHarness()
    const tooLarge = await second.web.handler(new Request(second.upload.url, {
      method: "PUT",
      headers: second.upload.headers,
      body: new Uint8Array([1, 2, 3, 4, 5]),
    }))
    expect(tooLarge.status).toBe(413)
  })

  test("rejects tampered tokens and prevents overwrite", async () => {
    const { web, upload } = await makeHarness()
    const tampered = `${upload.url.slice(0, -1)}x`
    expect((await web.handler(new Request(tampered, {
      method: "PUT",
      headers: upload.headers,
      body: new Uint8Array([1]),
    }))).status).toBe(400)

    const request = () => new Request(upload.url, {
      method: "PUT",
      headers: upload.headers,
      body: new Uint8Array([1]),
    })
    expect((await web.handler(request())).status).toBe(201)
    expect((await web.handler(request())).status).toBe(409)
  })
})
