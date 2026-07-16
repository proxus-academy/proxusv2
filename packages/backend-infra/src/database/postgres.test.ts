import { PgliteClient } from "@effect/sql-pglite"
import * as PgliteDrizzle from "drizzle-orm/effect-pglite"
import { describe, expect, test } from "vitest"
import { Effect, Layer } from "effect"
import { migratePglite } from "./pglite.js"
import { checkDatabaseMigrations } from "./postgres.js"

describe("database migration check", () => {
  test(
    "fails while migrations are pending and succeeds after they are applied",
    () => {
      const ClientLive = PgliteClient.layer()

      return Effect.runPromise(
        Effect.scoped(
          Effect.gen(function*() {
            const context = yield* Layer.build(ClientLive)
            return yield* Effect.gen(function*() {
              const db = yield* PgliteDrizzle.makeWithDefaults()
              const pending = yield* checkDatabaseMigrations(
                db,
                "./drizzle",
              ).pipe(Effect.flip)

              expect(pending._tag).toBe("PendingDatabaseMigrations")
              if (pending._tag === "PendingDatabaseMigrations") {
                expect(pending.pending).toHaveLength(2)
              }

              yield* migratePglite("./drizzle")
              yield* checkDatabaseMigrations(db, "./drizzle")
            }).pipe(Effect.provide(context))
          }),
        ),
      )
    },
    15_000,
  )
})
