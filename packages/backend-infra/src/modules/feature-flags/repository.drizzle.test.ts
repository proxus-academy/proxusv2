import { PgliteClient } from "@effect/sql-pglite"
import { FeatureFlagSnapshotRepository } from "@proxus/backend-domain/feature-flags"
import { eq } from "drizzle-orm"
import * as PgliteDrizzle from "drizzle-orm/effect-pglite"
import { Effect, Layer } from "effect"
import { describe, expect, test } from "vitest"
import { migratePglite } from "../../database/pglite.js"
import { featureFlagSnapshots } from "../../database/schema.js"

const configuration = [{ key: "registration.cta", enabled: true, allocationVersion: 2, default: "control", variants: [{ value: "control", weight: 5000 }, { value: "benefitCopy", weight: 5000 }] }]
import { FeatureFlagSnapshotRepositoryPgliteLive } from "./repository.pglite.layer.js"

describe("FeatureFlagSnapshotRepository Drizzle", () => {
  test("rejects an active SQL row that does not decode as a snapshot", () => {
    const client = PgliteClient.layer()
    const repository = FeatureFlagSnapshotRepositoryPgliteLive.pipe(Layer.provide(client))
    return Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const context = yield* Layer.build(Layer.merge(client, repository))
      return yield* Effect.gen(function*() {
        yield* migratePglite("./drizzle")
        const db = yield* PgliteDrizzle.makeWithDefaults()
        yield* db.insert(featureFlagSnapshots).values({
          configurationRevision: 1n,
          configuration: [{ key: "registration.cta" }],
          active: true,
        })

        const snapshots = yield* FeatureFlagSnapshotRepository
        const failure = yield* snapshots.readActive().pipe(Effect.flip)
        expect(failure).toMatchObject({
          _tag: "FeatureFlagSnapshotRepositoryError",
          operation: "readActive",
        })
      }).pipe(Effect.provide(context))
    })))
  }, 15_000)

  test("returns absence and then reads the complete active snapshot atomically", () => {
    const client = PgliteClient.layer()
    const repository = FeatureFlagSnapshotRepositoryPgliteLive.pipe(Layer.provide(client))
    return Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const context = yield* Layer.build(Layer.merge(client, repository))
      return yield* Effect.gen(function*() {
        yield* migratePglite("./drizzle")
        const snapshots = yield* FeatureFlagSnapshotRepository
        expect(yield* snapshots.readActive()).toBeNull()
        const db = yield* PgliteDrizzle.makeWithDefaults()
        const reservedRevision = yield* Effect.exit(
          db.insert(featureFlagSnapshots).values({
            configurationRevision: 0n,
            configuration: [],
            active: true,
          }),
        )
        expect(reservedRevision._tag).toBe("Failure")

        yield* snapshots.publish({ configurationRevision: 7, flags: configuration })
        expect(yield* snapshots.readActive()).toMatchObject({ configurationRevision: 7, flags: [{ key: "registration.cta" }] })

        yield* snapshots.publish({ configurationRevision: 8, flags: configuration })
        expect(yield* snapshots.readActive()).toMatchObject({ configurationRevision: 8 })
        expect((yield* db.select().from(featureFlagSnapshots)).filter(({ active }) => active)).toHaveLength(1)

        // A failed publication rolls the deactivation back and revisions cannot be overwritten.
        expect(yield* Effect.exit(snapshots.publish({ configurationRevision: 8, flags: configuration }))).toMatchObject({ _tag: "Failure" })
        expect(yield* snapshots.readActive()).toMatchObject({ configurationRevision: 8 })
        const mutation = yield* Effect.exit(db.update(featureFlagSnapshots).set({ configuration: [] }).where(eq(featureFlagSnapshots.configurationRevision, 8n)))
        expect(mutation._tag).toBe("Failure")
      }).pipe(Effect.provide(context))
    })))
  }, 15_000)
})
