import { Effect, Layer } from "effect"
import { describe, expect, test } from "vitest"
import { FeatureFlagSnapshotRepository } from "./repository.js"
import { FeatureFlagSnapshotReaderLive } from "./service.live.js"
import { FeatureFlagSnapshotReader } from "./service.js"

describe("feature flag snapshot services", () => {
  test("the reader supplies the empty initial snapshot", () => Effect.runPromise(Effect.gen(function*() {
    const repository = Layer.succeed(FeatureFlagSnapshotRepository, FeatureFlagSnapshotRepository.of({
      readActive: () => Effect.succeed(null),
      publish: () => Effect.void,
    }))
    const program = Effect.gen(function*() {
      const reader = yield* FeatureFlagSnapshotReader
      expect(yield* reader.getActiveSnapshot()).toEqual({ configurationRevision: 0, flags: [] })
    })
    // Test entry point provides the complete dependency graph once.
    // @effect-diagnostics-next-line strictEffectProvide:off
    yield* program.pipe(Effect.provide(FeatureFlagSnapshotReaderLive.pipe(Layer.provide(repository))))
  })))
})
