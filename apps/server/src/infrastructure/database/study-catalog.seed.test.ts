import { PgliteClient } from "@effect/sql-pglite"
import * as PgDrizzle from "drizzle-orm/effect-pglite"
import { eq } from "drizzle-orm"
import { describe, expect, test } from "vitest"
import { DateTime, Effect, Layer } from "effect"
import {
  resetPgliteStudyCatalog,
  seedPgliteStudyCatalog,
} from "./study-catalog.pglite.js"
import { studyAssets, studyEdges, studyNodes } from "./schema.js"

const migrationsFolder = "./drizzle"

describe("study catalog seed", () => {
  test(
    "is deterministic, idempotent and resettable",
    () => {
      const ClientLive = PgliteClient.layer()

      return Effect.runPromise(
        Effect.scoped(
          Effect.gen(function*() {
            const context = yield* Layer.build(ClientLive)
            return yield* Effect.gen(function*() {
              const db = yield* PgDrizzle.makeWithDefaults()

              yield* seedPgliteStudyCatalog(migrationsFolder)
              yield* seedPgliteStudyCatalog(migrationsFolder)

              expect(yield* db.select().from(studyAssets)).toHaveLength(2)
              expect(yield* db.select().from(studyNodes)).toHaveLength(5)
              expect(yield* db.select().from(studyEdges)).toHaveLength(5)

              const subject = (
                yield* db
                  .select()
                  .from(studyNodes)
                  .where(eq(studyNodes.kind, "subject"))
              )[0]!
              const subjectEdges = yield* db
                .select()
                .from(studyEdges)
                .where(eq(studyEdges.toNodeId, subject.id))
              expect(subjectEdges.map(({ kind }) => kind).sort()).toEqual([
                "DegreeSubjectEdge",
                "UniversitySubjectEdge",
              ])

              const university = (
                yield* db
                  .select()
                  .from(studyNodes)
                  .where(eq(studyNodes.kind, "university"))
              )[0]!
              yield* db
                .update(studyNodes)
                .set({ name: "Changed" })
                .where(eq(studyNodes.id, university.id))
              yield* seedPgliteStudyCatalog(migrationsFolder)
              const restoredUniversity = (
                yield* db
                  .select()
                  .from(studyNodes)
                  .where(eq(studyNodes.id, university.id))
              )[0]!
              expect(restoredUniversity.name).toBe(
                "Universidad Complutense de Madrid",
              )

              yield* db.insert(studyAssets).values({
                id: "40000000-0000-4000-8000-000000000001",
                storageKey: "temporary.webp",
                contentType: "image/webp",
                createdAt: DateTime.toDateUtc(
                  DateTime.makeUnsafe("2026-07-15T00:00:00.000Z"),
                ),
              })
              yield* resetPgliteStudyCatalog(migrationsFolder)

              expect(yield* db.select().from(studyAssets)).toHaveLength(2)
              expect(yield* db.select().from(studyNodes)).toHaveLength(5)
              expect(yield* db.select().from(studyEdges)).toHaveLength(5)
            }).pipe(Effect.provide(context))
          }),
        ),
      )
    },
    30_000,
  )
})
