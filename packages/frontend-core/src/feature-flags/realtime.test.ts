import type { FeatureFlagSnapshot } from "@proxus/shared/feature-flags"
import { Effect, Layer, Stream } from "effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { FeatureFlagSnapshotClient, makeFeatureFlagRealtimeAtoms, PublicRealtimeClient } from "./realtime.js"

const snapshot = (revision: number): FeatureFlagSnapshot => ({ configurationRevision: revision, flags: [] })

describe("feature flag realtime atom", () => {
  // Vitest bridge; behavior itself is represented by the mounted Effect atom.
  // @effect-diagnostics-next-line asyncFunction:off
  it("reconnects, refetches hints, deduplicates event/revision, and cleans up", async () => {
    let reads = 0
    let connections = 0
    let cleanups = 0
    const events = Stream.unwrap(Effect.acquireRelease(
      Effect.sync(() => ++connections),
      () => Effect.sync(() => { cleanups++ }),
    ).pipe(Effect.map((attempt) => attempt === 1
      ? Stream.fail(new Error("offline"))
      : Stream.concat(
          Stream.make(
            { _tag: "FeatureFlagSnapshotChanged", eventId: "event-2", revision: 2 } as const,
            { _tag: "FeatureFlagSnapshotChanged", eventId: "event-2", revision: 2 } as const,
          ),
          Stream.never,
        ))))
    const layer = Layer.mergeAll(
      Layer.succeed(FeatureFlagSnapshotClient, FeatureFlagSnapshotClient.of({
        getSnapshot: Effect.sync(() => snapshot(reads++)),
      })),
      Layer.succeed(PublicRealtimeClient, PublicRealtimeClient.of({ events })),
    )
    const atoms = makeFeatureFlagRealtimeAtoms(layer, { reconnectInitial: "1 millis", reconnectMaximum: "2 millis" })
    const registry = AtomRegistry.make()
    const unmount = registry.mount(atoms.lifecycleAtom)
    await Effect.runPromise(Effect.sleep("30 millis"))

    expect(connections).toBeGreaterThanOrEqual(2)
    expect(reads).toBe(3) // initial, failed connection reconciliation, one unique hint
    expect(AsyncResult.getOrThrow(registry.get(atoms.snapshotAtom)).configurationRevision).toBe(2)
    unmount()
    await Effect.runPromise(Effect.sleep("1 millis"))
    expect(cleanups).toBe(connections)
  })
})
