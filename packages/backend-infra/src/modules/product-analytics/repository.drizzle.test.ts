import { PgliteClient } from "@effect/sql-pglite"
import { ProductAnalyticsRepository } from "@proxus/backend-domain/product-analytics"
import { RegistrationStepCompleted } from "@proxus/shared/product-analytics"
import * as PgliteDrizzle from "drizzle-orm/effect-pglite"
import { DateTime, Effect, Layer } from "effect"
import { describe, expect, test } from "vitest"
import { migratePglite } from "../../database/pglite.js"
import { productAnalyticsEvents } from "../../database/schema/product-analytics.js"
import { ProductAnalyticsRepositoryPgliteLive } from "./repository.pglite.layer.js"

describe("ProductAnalyticsRepository Drizzle", () => {
  test("persists encoded events and ignores a repeated event id", () => {
    const client = PgliteClient.layer()
    const repository = ProductAnalyticsRepositoryPgliteLive.pipe(Layer.provide(client))

    return Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const context = yield* Layer.build(Layer.merge(client, repository))
      return yield* Effect.gen(function*() {
        yield* migratePglite("./drizzle")
        const analytics = yield* ProductAnalyticsRepository
        const envelope = {
          eventId: "00000000-0000-4000-8000-000000000101",
          receivedAt: "2026-07-31T12:00:00.000Z",
          occurredAt: "2026-07-31T11:59:59.000Z",
          subjectId: "00000000-0000-4000-8000-000000000102",
          sessionId: "00000000-0000-4000-8000-000000000103",
          flagKey: "registration.landing",
          variant: "short",
          revision: 4,
          event: new RegistrationStepCompleted({
            flagKey: "registration.landing",
            variant: "short",
            revision: 4,
            occurredAt: DateTime.makeUnsafe("2026-07-31T11:59:59.000Z"),
            step: "study",
            stepIndex: 2,
            totalSteps: 6,
            provider: "email",
          }),
        } as const

        yield* analytics.writeBatch([envelope])
        yield* analytics.writeBatch([envelope])

        const db = yield* PgliteDrizzle.makeWithDefaults()
        const rows = yield* db.select().from(productAnalyticsEvents)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
          eventType: "registration_step_completed",
          revision: 4n,
          payload: {
            _tag: "registration_step_completed",
            occurredAt: "2026-07-31T11:59:59.000Z",
            step: "study",
          },
        })
      }).pipe(Effect.provide(context))
    })))
  }, 15_000)
})
