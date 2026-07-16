// @effect-diagnostics nodeBuiltinImport:off asyncFunction:off strictEffectProvide:off anyUnknownInErrorContext:off missingEffectContext:off
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import { Effect, Layer, Stream } from "effect"
import { describe, expect, test } from "vitest"
import { ObjectStorage, ObjectStorageError } from "./object-storage.js"
import { layer } from "./object-storage.local.js"

const secret = "a-test-secret-with-at-least-32-characters"

const withStorage = <A>(
  run: (storage: typeof ObjectStorage.Service) => Effect.Effect<A, unknown>,
): Promise<A> => Effect.runPromise(Effect.acquireUseRelease(
  Effect.promise(() => mkdtemp(join(tmpdir(), "proxus-objects-"))),
  (root) => Effect.gen(function*() {
    const storage = yield* ObjectStorage
    return yield* run(storage)
  }).pipe(Effect.provide(layer({
    root,
    publicBaseUrl: "http://proxus.test",
    signingSecret: secret,
  }).pipe(Layer.provide([NodeFileSystem.layer, NodePath.layer])))),
  (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
))

const bytes = (...values: ReadonlyArray<number>) => new Uint8Array(values)

describe("LocalObjectStorage", () => {
  test("stores and streams an object with metadata", async () => {
    await withStorage((storage) => Effect.gen(function*() {
      yield* storage.put({
        key: "study-catalog/images/spain.webp",
        contentType: "image/webp",
        body: Stream.make(bytes(1, 2), bytes(3, 4)),
      })

      const object = yield* storage.get("study-catalog/images/spain.webp")
      const content = yield* Stream.runCollect(object.body)

      expect(object.contentType).toBe("image/webp")
      expect(object.contentLength).toBe(4n)
      expect(content.flatMap((chunk) => Array.from(chunk))).toEqual([1, 2, 3, 4])
      expect(yield* storage.publicUrl(object.key)).toBe(
        "http://proxus.test/objects/study-catalog/images/spain.webp",
      )
    }))
  })

  test("is create-only and removes complete objects", async () => {
    await withStorage((storage) => Effect.gen(function*() {
      const input = {
        key: "assets/item.bin",
        contentType: "application/octet-stream",
        body: Stream.make(bytes(1)),
      }
      yield* storage.put(input)
      const duplicate = yield* Effect.flip(storage.put(input))
      expect(duplicate._tag).toBe("ObjectAlreadyExists")

      yield* storage.remove(input.key)
      const missing = yield* Effect.flip(storage.get(input.key))
      expect(missing._tag).toBe("ObjectNotFound")
    }))
  })

  test("rejects traversal and absolute keys", async () => {
    await withStorage((storage) => Effect.gen(function*() {
      for (const key of ["../escape", "/absolute", "a//b", "a/./b", "a\\b"]) {
        const error = yield* Effect.flip(storage.publicUrl(key))
        expect(error._tag).toBe("InvalidObjectKey")
      }
    }))
  })

  test("cleans temporary data when the input stream fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "proxus-objects-"))
    try {
      const program = Effect.gen(function*() {
        const storage = yield* ObjectStorage
        yield* Effect.flip(storage.put({
          key: "assets/failing.bin",
          contentType: "application/octet-stream",
          body: Stream.concat(
            Stream.make(bytes(1)),
            Stream.fail(new ObjectStorageError({ operation: "source", key: "assets/failing.bin", cause: "boom" })),
          ),
        }))
      }).pipe(Effect.provide(layer({
        root,
        publicBaseUrl: "http://proxus.test",
        signingSecret: secret,
      }).pipe(Layer.provide([NodeFileSystem.layer, NodePath.layer]))))

      await Effect.runPromise(program)
      expect(await readdir(join(root, "assets"))).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("creates provider-independent transfer targets", async () => {
    await withStorage((storage) => Effect.gen(function*() {
      const upload = yield* storage.createUploadTarget({
        key: "assets/new.webp",
        contentType: "image/webp",
        maxContentLength: 100,
        expiresIn: 60_000,
      })
      const download = yield* storage.createDownloadTarget({
        key: "assets/new.webp",
        expiresIn: 60_000,
      })

      expect(upload.method).toBe("PUT")
      expect(upload.url).toContain("/object-transfers/upload/")
      expect(upload.headers).toEqual({ "content-type": "image/webp" })
      expect(download.method).toBe("GET")
      expect(download.url).toContain("/object-transfers/download/")
    }))
  })
})
