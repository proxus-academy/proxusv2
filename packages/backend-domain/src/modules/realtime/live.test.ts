import { AccountSessionsRevoked } from "../auth/events.js"
import { ApplicationEventPublisher } from "../application-events/service.js"
import { Effect, Fiber, Option, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { ApplicationRealtimeLive } from "./live.js"
import { RealtimeSource } from "./service.js"

describe("application realtime projection", () => {
  it("projects account session revocation only to the affected account", () => Effect.runPromise(
    Effect.scoped(Effect.gen(function*() {
      const program = Effect.gen(function*() {
        const publisher = yield* ApplicationEventPublisher
        const realtime = yield* RealtimeSource
        const affected = yield* realtime.forAccount("account-1").pipe(Stream.runHead, Effect.forkChild)
        const unrelated = yield* realtime.forAccount("account-2").pipe(Stream.runHead, Effect.forkChild)
        yield* Effect.yieldNow
        yield* publisher.publish(new AccountSessionsRevoked({ version: 1, accountId: "account-1" }))
        const delivery = yield* Fiber.join(affected)
        yield* Fiber.interrupt(unrelated)
        expect(Option.getOrThrow(delivery)).toMatchObject({
          accountId: "account-1",
          event: { _tag: "session.refresh-required", version: 1 },
        })
      })
      // Test entry point provides the complete scoped graph once.
      // @effect-diagnostics-next-line strictEffectProvide:off
      yield* program.pipe(Effect.provide(ApplicationRealtimeLive))
    })),
  ))
})
