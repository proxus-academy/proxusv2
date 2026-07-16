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

              const initialNodes = yield* db.select().from(studyNodes)
              const bachillerato = initialNodes.find(
                (node) => node.name === "Bachillerato",
              )!
              const firstUniversity = initialNodes.find(
                (node) => node.kind === "university",
              )!
              const firstSubject = initialNodes.find(
                (node) => node.kind === "subject",
              )!
              const customEdgeId = "40000000-0000-4000-8000-000000000002"

              yield* db.insert(studyEdges).values([
                {
                  id: "30000000-0000-4000-8000-000000000021",
                  kind: "TypeUniversityEdge",
                  fromNodeId: bachillerato.id,
                  toNodeId: firstUniversity.id,
                  position: 0,
                },
                {
                  id: customEdgeId,
                  kind: "custom",
                  fromNodeId: firstUniversity.id,
                  toNodeId: firstSubject.id,
                  position: 7,
                },
              ])

              yield* seedPgliteStudyCatalog(migrationsFolder)

              expect(yield* db.select().from(studyAssets)).toHaveLength(2)
              expect(yield* db.select().from(studyNodes)).toHaveLength(24)
              expect(yield* db.select().from(studyEdges)).toHaveLength(21)

              const nodes = yield* db.select().from(studyNodes)
              expect(nodes.filter((node) => node.kind === "country")).toHaveLength(4)
              expect(nodes.filter((node) => node.kind === "type")).toHaveLength(8)
              for (const kind of ["university", "degree", "subject"] as const) {
                expect(nodes.filter((node) => node.kind === kind)).toHaveLength(4)
              }

              const allEdges = yield* db.select().from(studyEdges)
              const canonicalEdges = allEdges.filter((edge) => edge.id !== customEdgeId)
              const countries = nodes.filter((node) => node.kind === "country")
              for (const country of countries) {
                const children = canonicalEdges.filter((edge) => edge.fromNodeId === country.id)
                expect(children).toHaveLength(2)
                expect(children.map((edge) => nodes.find((node) => node.id === edge.toNodeId)!.name).sort()).toEqual(["Bachillerato", "Universidad"])
              }

              const incomingCounts = new Map<string, number>()
              for (const edge of canonicalEdges) {
                incomingCounts.set(edge.toNodeId, (incomingCounts.get(edge.toNodeId) ?? 0) + 1)
              }
              for (const node of nodes.filter((node) => node.kind !== "country")) {
                expect(incomingCounts.get(node.id)).toBe(1)
              }

              expect(allEdges.some((edge) => edge.id === customEdgeId)).toBe(true)
              expect(allEdges.some((edge) => edge.id === "30000000-0000-4000-8000-000000000021")).toBe(false)
              expect(allEdges.some((edge) => edge.id === "30000000-0000-4000-8000-000000000013")).toBe(true)
              expect(allEdges.some((edge) => edge.id === "30000000-0000-4000-8000-000000000017")).toBe(true)

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
              expect(yield* db.select().from(studyNodes)).toHaveLength(24)
              expect(yield* db.select().from(studyEdges)).toHaveLength(20)
            }).pipe(Effect.provide(context))
          }),
        ),
      )
    },
    30_000,
  )
})
