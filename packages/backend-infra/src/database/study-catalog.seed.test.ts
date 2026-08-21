import { PgliteClient } from "@effect/sql-pglite"
import { findStudyEdgeEndpointKindMismatch } from "@proxus/shared/study-catalog"
import * as PgDrizzle from "drizzle-orm/effect-pglite"
import { eq } from "drizzle-orm"
import { describe, expect, test } from "vitest"
import { DateTime, Effect, Layer, Option } from "effect"
import {
  resetPgliteStudyCatalog,
  seedPgliteStudyCatalog,
} from "./study-catalog.pglite.js"
import { studyAssets, studyEdges, studyNodes } from "./schema/study-catalog.js"
import { studyCatalogSeed } from "./study-catalog.seed.js"

const migrationsFolder = "./drizzle"

const getDefined = <A>(value: A | undefined, message: string): A =>
  Option.getOrThrowWith(Option.fromUndefinedOr(value), () => new Error(message))

const getFirst = <A>(values: ReadonlyArray<A>, message: string): A =>
  Option.getOrThrowWith(Option.fromIterable(values), () => new Error(message))

describe("study catalog seed", () => {
  test("defines non-empty fixtures whose edge tags match both endpoint kinds", () => {
    getFirst(studyCatalogSeed.assets, "the seed must contain an asset")
    getFirst(studyCatalogSeed.nodes, "the seed must contain a node")
    getFirst(studyCatalogSeed.edges, "the seed must contain an edge")

    for (const edge of studyCatalogSeed.edges) {
      const fromNode = getDefined(
        studyCatalogSeed.nodes.find(({ id }) => id === edge.from),
        `missing seed source node ${edge.from}`,
      )
      const toNode = getDefined(
        studyCatalogSeed.nodes.find(({ id }) => id === edge.to),
        `missing seed target node ${edge.to}`,
      )
      expect(
        findStudyEdgeEndpointKindMismatch(edge, fromNode, toNode),
      ).toBeUndefined()
    }
  })

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
              const bachillerato = getDefined(
                initialNodes.find((node) => node.name === "Bachillerato"),
                "the seed must contain Bachillerato",
              )
              const firstUniversity = getDefined(
                initialNodes.find((node) => node.kind === "university"),
                "the seed must contain a university",
              )
              const firstSubject = getDefined(
                initialNodes.find((node) => node.kind === "subject"),
                "the seed must contain a subject",
              )
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
                expect(
                  children
                    .map((edge) =>
                      getDefined(
                        nodes.find((node) => node.id === edge.toNodeId),
                        `missing child node ${edge.toNodeId}`,
                      ).name,
                    )
                    .sort(),
                ).toEqual(["Bachillerato", "Universidad"])
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

              const university = getFirst(
                yield* db
                  .select()
                  .from(studyNodes)
                  .where(eq(studyNodes.kind, "university")),
                "the seeded database must contain a university",
              )
              yield* db
                .update(studyNodes)
                .set({ name: "Changed" })
                .where(eq(studyNodes.id, university.id))
              yield* seedPgliteStudyCatalog(migrationsFolder)
              const restoredUniversity = getFirst(
                yield* db
                  .select()
                  .from(studyNodes)
                  .where(eq(studyNodes.id, university.id)),
                "reseeding must restore the canonical university",
              )
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
