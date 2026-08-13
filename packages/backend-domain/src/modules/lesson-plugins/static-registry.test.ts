import { makeLessonTypeId } from "@proxus/shared/lesson-plugins"
import { Effect, Option } from "effect"
import { describe, expect, test } from "vitest"
import { lessonCounterManifest } from "./fixtures/lesson-counter.js"
import { LessonPluginRegistry } from "./service.js"
import { staticLessonPluginRegistryLayer } from "./static-registry.js"

const host = {
  version: "1.2.0",
  capabilities: new Set(["attempt-state", "completion-reporting"] as const),
}

// Test entry point provides the complete dependency graph once.
const program = <A, E>(effect: Effect.Effect<A, E, LessonPluginRegistry>, candidates: ReadonlyArray<unknown>) =>
  effect.pipe(
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(staticLessonPluginRegistryLayer(host, candidates)),
  )

type ManifestOverrides = Partial<Omit<typeof lessonCounterManifest, "manifestVersion">> & { readonly manifestVersion?: number }
const manifest = (overrides: ManifestOverrides = {}) => ({
  ...lessonCounterManifest,
  ...overrides,
})

describe("static LessonPluginRegistry contract", () => {
  test("registers and looks up the explicit lesson-counter fixture", () => Effect.runPromise(program(
    Effect.gen(function*() {
      const registry = yield* LessonPluginRegistry
      const found = yield* registry.lookup(makeLessonTypeId("com.proxus.lesson-counter"))
      expect(yield* registry.manifests()).toHaveLength(1)
      expect(Option.getOrThrow(found).pluginVersion).toBe("1.0.0")
    }),
    [lessonCounterManifest],
  )))

  test("returns None for an unknown lesson type", () => Effect.runPromise(program(
    Effect.gen(function*() {
      const registry = yield* LessonPluginRegistry
      const found = yield* registry.lookup(makeLessonTypeId("com.proxus.unknown-lesson"))
      expect(Option.isNone(found)).toBe(true)
    }),
    [lessonCounterManifest],
  )))

  test("fails closed on duplicate lesson type ids", () => Effect.runPromise(Effect.gen(function*() {
    const error = yield* program(Effect.void, [lessonCounterManifest, lessonCounterManifest]).pipe(Effect.flip)
    expect(error).toMatchObject({ _tag: "DuplicateLessonTypeId", lessonTypeId: "com.proxus.lesson-counter" })
  })))

  test("fails closed when the host version is incompatible", () => Effect.runPromise(Effect.gen(function*() {
    const error = yield* program(Effect.void, [manifest({ minimumHostVersion: "2.0.0" })]).pipe(Effect.flip)
    expect(error).toMatchObject({ _tag: "IncompatibleLessonPluginVersion" })
  })))

  test("fails closed when a capability is unavailable", () => Effect.runPromise(Effect.gen(function*() {
    const limitedHost = { version: "1.2.0", capabilities: new Set(["attempt-state"] as const) }
    // Test entry point provides the complete dependency graph once.
    // @effect-diagnostics-next-line strictEffectProvide:off
    const failure = Effect.void.pipe(
      Effect.provide(staticLessonPluginRegistryLayer(limitedHost, [lessonCounterManifest])),
      Effect.flip,
    )
    expect(yield* failure).toMatchObject({
      _tag: "UnsupportedLessonPluginCapability",
      capability: "completion-reporting",
    })
  })))

  test("fails closed on malformed versions and manifest versions", () => Effect.runPromise(Effect.gen(function*() {
    const invalidPluginVersion = yield* program(Effect.void, [manifest({ pluginVersion: "latest" })]).pipe(Effect.flip)
    expect(invalidPluginVersion).toMatchObject({ _tag: "LessonPluginManifestInvalid", manifestIndex: 0 })

    const invalidManifestVersion = yield* program(Effect.void, [manifest({ manifestVersion: 2 })]).pipe(Effect.flip)
    expect(invalidManifestVersion).toMatchObject({ _tag: "LessonPluginManifestInvalid", manifestIndex: 0 })
  })))
})
