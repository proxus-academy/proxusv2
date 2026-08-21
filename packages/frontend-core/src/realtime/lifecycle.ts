import { Effect, Layer, Stream } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import { RealtimeClient } from "./client.js"

const RealtimeNotConfigured = Layer.effect(
  RealtimeClient,
  Effect.die(new Error("RealtimeClient is not configured for this AtomRegistry")),
)

export const realtimeRuntime = Atom.runtime(Layer.merge(RealtimeNotConfigured, Reactivity.layer))

export const makeRealtimeModule = (
  runtime: Atom.AtomRuntime<RealtimeClient | Reactivity.Reactivity>,
) => {
  const lifecycleAtom = runtime.atom(Effect.gen(function*() {
    const client = yield* RealtimeClient
    const reactivity = yield* Reactivity.Reactivity
    return yield* client.events.pipe(Stream.runForEach((event) =>
      event._tag === "session.refresh-required"
        ? reactivity.invalidate(["auth"])
        : Effect.void))
  })).pipe(Atom.setIdleTTL(0))
  return { lifecycleAtom }
}
