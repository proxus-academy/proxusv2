// Vitest assertions consume promises at this test boundary.
// @effect-diagnostics asyncFunction:off
import { Effect } from "effect"
import { describe, expect, test } from "vitest"
import { isEmptyStageDocument, makeGcsState, StateBackendError, StateConflictError, type GcsClient, type KmsClient } from "./gcs-state.ts"
import { InvalidLeaseTtlError, LockExpiredError, LockHeldError, LockOwnerError, makeLeaseLock } from "./lease-lock.ts"
import { makeMutationRateLimiter } from "./mutation-rate-limiter.ts"

const makeFixture = () => {
  const objects = new Map<string, { data: Uint8Array; generation: string }>()
  let nextGeneration = 1
  let now = 1_000
  const gcs: GcsClient = {
    read: (name) => Effect.succeed(objects.get(name)),
    list: (prefix) => Effect.succeed([...objects.keys()].filter((name) => name.startsWith(prefix)).sort()),
    delete: (name, expected) => Effect.suspend(() => {
      if (objects.get(name)?.generation !== expected) return Effect.fail(new StateConflictError({ object: name }))
      objects.delete(name)
      return Effect.void
    }),
    write: (name, data, expected) => Effect.suspend(() => {
      if ((objects.get(name)?.generation ?? "0") !== expected) return Effect.fail(new StateConflictError({ object: name }))
      const generation = String(nextGeneration++)
      objects.set(name, { data: data.slice(), generation })
      return Effect.succeed(generation)
    }),
  }
  const kms: KmsClient = {
    encrypt: (value) => Effect.succeed(Uint8Array.from(value, (byte) => byte ^ 0xa5)),
    decrypt: (value) => Effect.succeed(Uint8Array.from(value, (byte) => byte ^ 0xa5)),
  }
  const clock = { now: Effect.sync(() => now) }
  const mutationRateLimiter = makeMutationRateLimiter({ minimumIntervalMs: 0 })
  return { objects, gcs, kms, clock, mutationRateLimiter, advance: (ms: number) => { now += ms } }
}
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)
const acquire = (fixture: ReturnType<typeof makeFixture>, leaseId = "lease") =>
  run(makeLeaseLock(fixture).acquire({ stack: "app", stage: "prod", owner: leaseId, leaseId, ttlMs: 100 }))

describe("atomic GCS/KMS Alchemy state", () => {
  test("classifies absent and empty-object outputs as empty without accepting meaningful state", () => {
    const base = { version: 1 as const, resources: {} }
    expect(isEmptyStageDocument(base)).toBe(true)
    expect(isEmptyStageDocument({ ...base, output: {} })).toBe(true)
    expect(isEmptyStageDocument({ ...base, output: { value: 1 } })).toBe(false)
    expect(isEmptyStageDocument({ ...base, output: null })).toBe(false)
    expect(isEmptyStageDocument({ ...base, resources: { tombstone: { status: "deleted" } } })).toBe(false)
    expect(isEmptyStageDocument({ ...base, lease: { owner: "owner", leaseId: "id", expiresAt: 1 } })).toBe(false)
  })

  test("stores encrypted lease, resources and output in exactly one stage object", async () => {
    const fixture = makeFixture()
    const lease = await acquire(fixture)
    const state = makeGcsState({ ...fixture, lease })
    const resource = { status: "created", id: "resource-id" } as never
    await run(state.set({ stack: "app", stage: "prod", fqn: "module/resource", value: resource }))
    await run(state.setOutput({ stack: "app", stage: "prod", value: { token: "plaintext-secret" } }))

    expect(fixture.objects.size).toBe(1)
    expect(new TextDecoder().decode([...fixture.objects.values()][0]!.data)).not.toContain("plaintext-secret")
    expect(await run(state.get({ stack: "app", stage: "prod", fqn: "module/resource" }))).toEqual(resource)
    expect(await run(state.getOutput({ stack: "app", stage: "prod" }))).toEqual({ token: "plaintext-secret" })
    expect(await run(state.get({ stack: "app", stage: "prod", fqn: "__stack_output__" }))).toEqual({ token: "plaintext-secret" })
    expect(await run(state.list({ stack: "app", stage: "prod" }))).toEqual(["module/resource"])
    expect(await run(state.listStacks())).toEqual(["app"])
    expect(await run(state.listStages("app"))).toEqual(["prod"])
  })

  test("surfaces sanitized backend diagnostics through StateStoreError", async () => {
    const fixture = makeFixture()
    const lease = await acquire(fixture)
    const gcs: GcsClient = {
      ...fixture.gcs,
      read: () => Effect.fail(new StateBackendError({
        operation: "gcs-read-status",
        status: 429,
        attempt: 5,
        cause: new Error("sensitive response body"),
      })),
    }
    const state = makeGcsState({ ...fixture, gcs, lease })

    await expect(run(state.getOutput({ stack: "app", stage: "prod" }))).rejects.toMatchObject({
      _tag: "StateStoreError",
      message: "remote state operation failed (operation=gcs-read-status status=429 attempt=5 cause=Error)",
      cause: { name: "SanitizedStateCause", diagnostic: { operation: "gcs-read-status", status: 429, attempt: 5, cause: "Error" } },
    })
    await expect(run(state.getOutput({ stack: "app", stage: "prod" }))).rejects.not.toHaveProperty("cause.diagnostic.message")
  })

  test("two process-local handles refresh their shared lease generation", async () => {
    const fixture = makeFixture()
    const parentLease = await acquire(fixture)
    const childLease = { ...parentLease }
    const lock = makeLeaseLock(fixture)
    const child = makeGcsState({ ...fixture, lease: childLease })

    await run(child.setOutput({ stack: "app", stage: "prod", value: 1 }))
    await run(child.setOutput({ stack: "app", stage: "prod", value: 2 }))
    await run(lock.renew({ stack: "app", stage: "prod", lease: parentLease, ttlMs: 100 }))
    await run(child.setOutput({ stack: "app", stage: "prod", value: 3 }))
    await run(lock.release({ stack: "app", stage: "prod", lease: parentLease }))

    await expect(run(child.setOutput({ stack: "app", stage: "prod", value: 4 }))).rejects.toMatchObject({
      _tag: "StateStoreError", message: "remote state changed concurrently",
    })
  })

  test("merges 48 parallel writes and 24 parallel deletes while the parent renews the lease", async () => {
    const fixture = makeFixture()
    const parentLease = await acquire(fixture)
    const child = makeGcsState({ ...fixture, lease: { ...parentLease } })
    const lock = makeLeaseLock(fixture)
    const resources = Array.from({ length: 48 }, (_, index) => `resource-${index}`)

    await Promise.all([
      ...resources.map((fqn) => run(child.set({ stack: "app", stage: "prod", fqn, value: { fqn } as never }))),
      run(lock.renew({ stack: "app", stage: "prod", lease: parentLease, ttlMs: 200 })),
    ])
    await Promise.all(resources.filter((_, index) => index % 2 === 0).map((fqn) =>
      run(child.delete({ stack: "app", stage: "prod", fqn })),
    ))

    expect(await run(child.list({ stack: "app", stage: "prod" }))).toEqual(resources.filter((_, index) => index % 2 === 1).sort())
  })

  test("spaces a burst of 30 writes and a parent renewal with one process-wide fake-clock coordinator", async () => {
    const fixture = makeFixture()
    let now = 10_000
    const starts: number[] = []
    const limiter = makeMutationRateLimiter({
      minimumIntervalMs: 1_100,
      now: () => now,
      sleep: (milliseconds) => Effect.sync(() => { now += milliseconds }),
    })
    const observedGcs: GcsClient = {
      ...fixture.gcs,
      write: (object, data, generation) => Effect.sync(() => { starts.push(now) }).pipe(
        Effect.andThen(fixture.gcs.write(object, data, generation)),
      ),
    }
    const shared = { ...fixture, gcs: observedGcs, clock: { now: Effect.sync(() => now) }, mutationRateLimiter: limiter }
    const lock = makeLeaseLock(shared)
    const parentLease = await run(lock.acquire({ stack: "app", stage: "prod", owner: "parent", leaseId: "parent", ttlMs: 100_000 }))
    const child = makeGcsState({ ...shared, lease: { ...parentLease } })

    await Promise.all([
      ...Array.from({ length: 30 }, (_, index) => run(child.set({ stack: "app", stage: "prod", fqn: `burst-${index}`, value: { index } as never }))),
      run(lock.renew({ stack: "app", stage: "prod", lease: parentLease, ttlMs: 100_000 })),
    ])

    expect(starts).toHaveLength(32)
    expect(starts.slice(1).every((started, index) => started - starts[index]! >= 1_100)).toBe(true)
    expect(await run(child.list({ stack: "app", stage: "prod" }))).toHaveLength(30)
  })

  test("CAS retries merge distinct process-local writers sharing only the fenced identity", async () => {
    const fixture = makeFixture()
    const lease = await acquire(fixture)
    // Distinct client identities model processes, so their in-memory mutexes cannot coordinate.
    const facade = (): GcsClient => ({ read: fixture.gcs.read, write: fixture.gcs.write, delete: fixture.gcs.delete, list: fixture.gcs.list })
    const writerA = makeGcsState({ ...fixture, gcs: facade(), lease: { ...lease } })
    const writerB = makeGcsState({ ...fixture, gcs: facade(), lease: { ...lease } })
    const writes = Array.from({ length: 24 }, (_, index) => {
      const state = index % 2 === 0 ? writerA : writerB
      return run(state.set({ stack: "app", stage: "prod", fqn: `cross-${index}`, value: { index } as never }))
    })

    await Promise.all(writes)
    expect(await run(writerA.list({ stack: "app", stage: "prod" }))).toHaveLength(24)
  })

  test("deletes logical state without deleting the fenced object", async () => {
    const fixture = makeFixture()
    const lease = await acquire(fixture)
    const state = makeGcsState({ ...fixture, lease })
    await run(state.setOutput({ stack: "app", stage: "prod", value: "value" }))
    await run(state.deleteStack({ stack: "app", stage: "prod" }))
    expect(fixture.objects.size).toBe(1)
    expect(await run(state.getOutput({ stack: "app", stage: "prod" }))).toBeUndefined()
    await expect(run(state.deleteStack({ stack: "app" }))).rejects.toMatchObject({ _tag: "StateStoreError" })
  })
})

describe("atomic stage lease", () => {
  test("acquire, renew, state mutation and release all CAS the one object", async () => {
    const fixture = makeFixture()
    const lock = makeLeaseLock(fixture)
    const lease = await run(lock.acquire({ stack: "app", stage: "prod", owner: "one", leaseId: "one", ttlMs: 10 }))
    const state = makeGcsState({ ...fixture, lease })
    const generations = [lease.generation]
    await run(state.setOutput({ stack: "app", stage: "prod", value: 1 })); generations.push(lease.generation)
    await run(lock.renew({ stack: "app", stage: "prod", lease, ttlMs: 20 })); generations.push(lease.generation)
    await run(lock.release({ stack: "app", stage: "prod", lease }))
    expect(new Set(generations).size).toBe(3)
    expect(fixture.objects.size).toBe(1)
  })

  test("release prunes an empty stage with generation CAS, including an empty output object", async () => {
    const fixture = makeFixture(); const lock = makeLeaseLock(fixture)
    const lease = await run(lock.acquire({ stack: "app", stage: "prod", owner: "one", leaseId: "one", ttlMs: 10 }))
    const state = makeGcsState({ ...fixture, lease })
    await run(state.setOutput({ stack: "app", stage: "prod", value: {} }))
    await run(lock.release({ stack: "app", stage: "prod", lease }))
    expect(fixture.objects.size).toBe(0)
  })

  test("release never prunes nonempty state", async () => {
    const fixture = makeFixture(); const lock = makeLeaseLock(fixture)
    const lease = await run(lock.acquire({ stack: "app", stage: "prod", owner: "one", leaseId: "one", ttlMs: 10 }))
    const state = makeGcsState({ ...fixture, lease })
    await run(state.set({ stack: "app", stage: "prod", fqn: "resource", value: { status: "created" } as never }))
    await run(lock.release({ stack: "app", stage: "prod", lease }))
    expect(fixture.objects.size).toBe(1)
  })

  test("a delete CAS race re-reads and cannot prune a takeover writer", async () => {
    const fixture = makeFixture(); const normal = fixture.gcs
    const lockB = makeLeaseLock({ ...fixture, mutationRateLimiter: makeMutationRateLimiter({ minimumIntervalMs: 0 }) })
    let raced = false
    const racing: GcsClient = { ...normal, delete: (name, generation) => Effect.gen(function* () {
      if (!raced) {
        raced = true
        fixture.advance(11)
        yield* Effect.promise(() => run(lockB.acquire({ stack: "app", stage: "prod", owner: "B", leaseId: "B", ttlMs: 100 })))
      }
      return yield* normal.delete(name, generation)
    }) }
    const lockA = makeLeaseLock({ ...fixture, gcs: racing })
    const leaseA = await run(lockA.acquire({ stack: "app", stage: "prod", owner: "A", leaseId: "A", ttlMs: 10 }))
    await expect(run(lockA.release({ stack: "app", stage: "prod", lease: leaseA }))).rejects.toBeInstanceOf(LockOwnerError)
    expect(fixture.objects.size).toBe(1)
  })

  test("fences an expired owner after takeover without losing state", async () => {
    const fixture = makeFixture()
    const lock = makeLeaseLock(fixture)
    const leaseA = await run(lock.acquire({ stack: "app", stage: "prod", owner: "A", leaseId: "A", ttlMs: 10 }))
    const stateA = makeGcsState({ ...fixture, lease: leaseA })
    await run(stateA.setOutput({ stack: "app", stage: "prod", value: "A" }))
    fixture.advance(11)
    const leaseB = await run(lock.acquire({ stack: "app", stage: "prod", owner: "B", leaseId: "B", ttlMs: 10 }))
    const stateB = makeGcsState({ ...fixture, lease: leaseB })
    expect(await run(stateB.getOutput({ stack: "app", stage: "prod" }))).toBe("A")
    await run(stateB.setOutput({ stack: "app", stage: "prod", value: "B" }))
    await expect(run(lock.renew({ stack: "app", stage: "prod", lease: leaseA, ttlMs: 10 }))).rejects.toBeInstanceOf(LockOwnerError)
    await expect(run(stateA.setOutput({ stack: "app", stage: "prod", value: "stale" }))).rejects.toMatchObject({ _tag: "StateStoreError" })
  })

  test("rejects active, stale, expired and invalid leases", async () => {
    const fixture = makeFixture(); const lock = makeLeaseLock(fixture)
    const lease = await run(lock.acquire({ stack: "app", stage: "prod", owner: "one", leaseId: "one", ttlMs: 10 }))
    await expect(run(lock.acquire({ stack: "app", stage: "prod", owner: "two", leaseId: "two", ttlMs: 10 }))).rejects.toBeInstanceOf(LockHeldError)
    await expect(run(lock.release({ stack: "app", stage: "prod", lease: { ...lease, owner: "two" } }))).rejects.toBeInstanceOf(LockOwnerError)
    fixture.advance(10)
    await expect(run(lock.renew({ stack: "app", stage: "prod", lease, ttlMs: 10 }))).rejects.toBeInstanceOf(LockExpiredError)
    await expect(run(lock.acquire({ stack: "x", stage: "y", owner: "x", leaseId: "x", ttlMs: 0 }))).rejects.toBeInstanceOf(InvalidLeaseTtlError)
  })
})
