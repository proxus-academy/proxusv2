import type { FeatureFlagSnapshot } from "@proxus/shared/feature-flags"
import { Deferred, Duration, Effect, Layer } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { TestClock } from "effect/testing"
import { describe, expect, it } from "vitest"
import {
  defaultFeatureFlagSnapshotRefreshInterval,
  FeatureFlagDistribution,
  makeFeatureFlagSnapshotModule,
} from "./distribution.js"

const snapshot = (configurationRevision: number): FeatureFlagSnapshot => ({
  configurationRevision,
  flags: [],
})

describe("feature flag snapshot module", () => {
  it("revalidates with virtual time, preserves success while waiting, and stops when its scope closes", () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      let reads = 0
      const secondRead = yield* Deferred.make<FeatureFlagSnapshot>()
      const distributionLayer = Layer.succeed(
        FeatureFlagDistribution,
        FeatureFlagDistribution.of({
          getActiveSnapshot: () => Effect.suspend(() => {
            reads++
            return reads === 1
              ? Effect.succeed(snapshot(1))
              : Deferred.await(secondRead)
          }),
        }),
      )
      const clockContext = yield* Layer.build(TestClock.layer())
      const clockLayer = Layer.succeedContext(clockContext)
      const featureFlags = Layer.merge(distributionLayer, clockLayer).pipe(
        Atom.runtime,
        makeFeatureFlagSnapshotModule,
      )

      yield* Effect.gen(function*() {
        yield* Effect.scoped(Effect.gen(function*() {
          const registryContext = yield* Layer.build(AtomRegistry.layer)
          yield* Effect.gen(function*() {
            const registry = yield* AtomRegistry.AtomRegistry
            yield* AtomRegistry.mount(registry, featureFlags.lifecycleAtom)

            expect(yield* AtomRegistry.getResult(registry, featureFlags.snapshotAtom)).toEqual(snapshot(1))
            expect(reads).toBe(1)

            yield* TestClock.adjust(defaultFeatureFlagSnapshotRefreshInterval)
            const revalidating = registry.get(featureFlags.snapshotAtom)
            expect(AsyncResult.isSuccess(revalidating)).toBe(true)
            if (AsyncResult.isSuccess(revalidating)) {
              expect(revalidating.value.configurationRevision).toBe(1)
              expect(revalidating.waiting).toBe(true)
            }

            yield* Deferred.succeed(secondRead, snapshot(2))
            expect(yield* AtomRegistry.getResult(
              registry,
              featureFlags.snapshotAtom,
              { suspendOnWaiting: true },
            )).toEqual(snapshot(2))
            expect(reads).toBe(2)
          }).pipe(Effect.provide(registryContext))
        }))

        yield* TestClock.adjust(Duration.minutes(5))
        expect(reads).toBe(2)
      }).pipe(Effect.provide(clockContext))
    }))))
})
