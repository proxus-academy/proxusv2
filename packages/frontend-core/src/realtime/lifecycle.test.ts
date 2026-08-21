import { SessionRefreshRequired } from "@proxus/shared/realtime"
import { Effect, Layer, Stream } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import { describe, expect, it } from "vitest"
import { RealtimeClient } from "./client.js"
import { makeRealtimeModule } from "./lifecycle.js"

describe("realtime lifecycle", () => {
  it("invalidates auth state for a session refresh event", () => Effect.runPromise(
    Effect.scoped(Effect.gen(function*() {
      const reactivity = yield* Reactivity.make
      let invalidations = 0
      const unregister = reactivity.registerUnsafe(["auth"], () => { invalidations++ })
      yield* Effect.addFinalizer(() => Effect.sync(unregister))
      const live = Layer.merge(
        Layer.succeed(RealtimeClient, RealtimeClient.of({
          events: Stream.make(new SessionRefreshRequired({ version: 1 })),
        })),
        Layer.succeed(Reactivity.Reactivity, reactivity),
      )
      const module = live.pipe(Atom.runtime, makeRealtimeModule)
      const registryContext = yield* Layer.build(AtomRegistry.layer)
      yield* Effect.gen(function*() {
        const registry = yield* AtomRegistry.AtomRegistry
        yield* AtomRegistry.mount(registry, module.lifecycleAtom)
        yield* Effect.yieldNow
        expect(invalidations).toBe(1)
      }).pipe(Effect.provide(registryContext))
    })),
  ))
})
