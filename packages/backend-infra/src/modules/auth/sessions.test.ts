// @effect-diagnostics strictEffectProvide:off globalDateInEffect:off globalDate:off asyncFunction:off
import { Clock, Effect, Layer, Random } from "effect"
import { describe, expect, it } from "vitest"
import { SessionRepository, makeMemorySessionRepository, makeUserId } from "@proxus/backend-domain/auth"
import { OpaqueSessions, hashSessionToken, makeOpaqueSessionsLive } from "./sessions.js"

const policy = { ttlMillis: 1_000, renewalWindowMillis: 400, rotationGraceMillis: 100 }
const makeRandom = (): typeof Random.Random.Service => {
  let value = 0
  return { nextIntUnsafe: () => value++, nextDoubleUnsafe: () => 0 }
}
const clockAt = (millis: number): typeof Clock.Clock.Service => ({
  currentTimeMillisUnsafe: () => millis,
  currentTimeMillis: Effect.succeed(millis),
  currentTimeNanosUnsafe: () => BigInt(millis) * 1_000_000n,
  currentTimeNanos: Effect.succeed(BigInt(millis) * 1_000_000n),
  sleep: () => Effect.void,
})

const layerAt = (millis: number) => makeOpaqueSessionsLive(policy).pipe(
  Layer.provideMerge(makeMemorySessionRepository()),
  Layer.provideMerge(Layer.succeed(Random.Random, makeRandom())),
  Layer.provideMerge(Layer.succeed(Clock.Clock, clockAt(millis))),
)

const runAt = <A, E>(millis: number, effect: Effect.Effect<A, E, OpaqueSessions | SessionRepository>) => Effect.runPromise(effect.pipe(Effect.provide(layerAt(millis))))

describe("opaque sessions", () => {
  it("persists only a hash and rejects expiration", async () => {
    const result = await runAt(1_000, Effect.gen(function*() {
      const sessions = yield* OpaqueSessions
      const repository = yield* SessionRepository
      const issued = yield* sessions.create(makeUserId("00000000-0000-4000-8000-000000000001"))
      const stored = yield* repository.findActiveByTokenHash(hashSessionToken(issued.token), new Date(1_001))
      const plain = yield* repository.findActiveByTokenHash(issued.token, new Date(1_001))
      const expired = yield* repository.findActiveByTokenHash(hashSessionToken(issued.token), new Date(2_000))
      return { issued, stored, plain, expired }
    }))
    expect(result.issued.session.tokenHash).not.toBe(result.issued.token)
    expect(result.stored._tag).toBe("Some")
    expect(result.plain._tag).toBe("None")
    expect(result.expired._tag).toBe("None")
  })

  it("rotates once under concurrent requests and accepts the loser only during grace", async () => {
    let millis = 1_000
    const clock: typeof Clock.Clock.Service = {
      currentTimeMillisUnsafe: () => millis,
      get currentTimeMillis() { return Effect.sync(() => millis) },
      currentTimeNanosUnsafe: () => BigInt(millis) * 1_000_000n,
      get currentTimeNanos() { return Effect.sync(() => BigInt(millis) * 1_000_000n) },
      sleep: () => Effect.void,
    }
    const layer = makeOpaqueSessionsLive(policy).pipe(
      Layer.provideMerge(makeMemorySessionRepository()),
      Layer.provideMerge(Layer.succeed(Random.Random, makeRandom())),
      Layer.provideMerge(Layer.succeed(Clock.Clock, clock)),
    )
    const result = await Effect.runPromise(Effect.gen(function*() {
      const sessions = yield* OpaqueSessions
      const issued = yield* sessions.create(makeUserId("00000000-0000-4000-8000-000000000001"))
      millis = 1_700
      const pair = yield* Effect.all([sessions.resolve(issued.token), sessions.resolve(issued.token)], { concurrency: "unbounded" })
      return { issued, pair }
    }).pipe(Effect.provide(layer)))
    expect(result.pair.map((item) => item._tag).sort()).toEqual(["Grace", "Rotated"])
  })

  it("revokeAll invalidates every account session and leaves other accounts active", async () => {
    const tags = await runAt(1_000, Effect.gen(function*() {
      const sessions = yield* OpaqueSessions
      const repository = yield* SessionRepository
      const owner = makeUserId("00000000-0000-4000-8000-000000000001")
      const other = makeUserId("00000000-0000-4000-8000-000000000002")
      const first = yield* sessions.create(owner)
      const second = yield* sessions.create(owner)
      const third = yield* sessions.create(other)
      yield* repository.revokeAllForAccount(owner, new Date(1_001))
      return yield* Effect.all([sessions.resolve(first.token), sessions.resolve(second.token), sessions.resolve(third.token)]).pipe(Effect.map((all) => all.map((item) => item._tag)))
    }))
    expect(tags).toEqual(["Missing", "Missing", "Active"])
  })
})
