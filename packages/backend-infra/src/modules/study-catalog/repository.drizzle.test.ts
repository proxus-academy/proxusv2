import { PgliteClient } from "@effect/sql-pglite"
import { eq, sql } from "drizzle-orm"
import * as PgliteDrizzle from "drizzle-orm/effect-pglite"
import {
  CountryNode,
  CountryTypeEdge,
  DegreeNode,
  DegreeSubjectEdge,
  SubjectNode,
  StudyTypeNode,
  UniversityNode,
  UniversitySubjectEdge,
  makeCountryNodeId,
  makeDegreeNodeId,
  makeStudyAssetId,
  makeStudyEdgeId,
  makeStudyTypeNodeId,
  makeSubjectNodeId,
  makeUniversityNodeId,
} from "@proxus/shared/study-catalog"
import { describe, expect, test } from "vitest"
import { Context, DateTime, Effect, Layer, Option } from "effect"
import { migratePglite } from "../../database/pglite.js"
import {
  studyAssets,
  studyEdges,
  studyNodes,
} from "../../database/schema.js"
import {
  StudyCatalog,
  StudyCatalogLive,
  StudyCatalogRepository,
} from "@proxus/backend-domain/study-catalog"
import {
  Access,
  AccessControlService,
} from "@proxus/backend-domain/access-control"
import { makeStudyCatalogRepositoryDrizzle } from "./repository.drizzle.js"
import { StudyCatalogRepositoryPgliteLive } from "./repository.pglite.layer.js"

const countryId = makeCountryNodeId("00000000-0000-4000-8000-000000000001")
const typeId = makeStudyTypeNodeId("00000000-0000-4000-8000-000000000002")
const missingTypeId = makeStudyTypeNodeId(
  "00000000-0000-4000-8000-000000000003",
)
const edgeId = makeStudyEdgeId("00000000-0000-4000-8000-000000000101")
const now = DateTime.makeUnsafe("2026-07-14T12:00:00.000Z")
const later = DateTime.makeUnsafe("2026-07-14T13:00:00.000Z")
const universityId = makeUniversityNodeId(
  "00000000-0000-4000-8000-000000000004",
)
const degreeId = makeDegreeNodeId("00000000-0000-4000-8000-000000000005")
const subjectId = makeSubjectNodeId("00000000-0000-4000-8000-000000000006")
const secondTypeId = makeStudyTypeNodeId("00000000-0000-4000-8000-000000000007")
const thirdTypeId = makeStudyTypeNodeId("00000000-0000-4000-8000-000000000008")
const secondCountryId = makeCountryNodeId(
  "00000000-0000-4000-8000-000000000009",
)

const country = new CountryNode({
  id: countryId,
  kind: "country",
  name: "Spain",
  imageAssetId: null,
  status: "published",
  createdAt: now,
  updatedAt: now,
})

const studyType = new StudyTypeNode({
  id: typeId,
  kind: "type",
  name: "University studies",
  imageAssetId: null,
  status: "draft",
  createdAt: now,
  updatedAt: now,
})

const edge = new CountryTypeEdge({
  id: edgeId,
  from: countryId,
  to: typeId,
  position: 2,
})

const withRepository = <A, E>(
  effect: Effect.Effect<A, E, StudyCatalogRepository>,
) => {
  const ClientLive = PgliteClient.layer()
  const RepositoryLive = StudyCatalogRepositoryPgliteLive.pipe(
    Layer.provide(ClientLive),
  )
  const TestLive = Layer.merge(ClientLive, RepositoryLive)

  return Effect.scoped(
    Effect.gen(function*() {
      const context = yield* Layer.build(TestLive)
      return yield* Effect.gen(function*() {
        yield* migratePglite("./drizzle")
        return yield* effect
      }).pipe(Effect.provide(context))
    }),
  )
}

describe("StudyCatalogRepository Drizzle contract", () => {
  test("lists only published countries", () =>
    Effect.runPromise(
      withRepository(
        Effect.gen(function*() {
          const repository = yield* StudyCatalogRepository
          yield* repository.createNode(country)
          yield* repository.createNode(studyType)
          expect(yield* repository.listCountries()).toEqual([country])
        }),
      ),
    ),
    15_000,
  )

  test("lists admin nodes with kind and status filters", () =>
    Effect.runPromise(
      withRepository(
        Effect.gen(function*() {
          const repository = yield* StudyCatalogRepository
          yield* repository.createNode(country)
          yield* repository.createNode(studyType)

          expect(yield* repository.listNodes({ kind: "country", status: "published" })).toEqual([country])
          expect(yield* repository.listNodes({ kind: "type", status: "draft" })).toEqual([studyType])
          expect(yield* repository.listNodes({ kind: "country", status: "draft" })).toEqual([])
        }),
      ),
    ),
    15_000,
  )

  test("maps an unexpectedly empty INSERT RETURNING result to a repository failure", () => {
    const ClientLive = PgliteClient.layer()

    return Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const context = yield* Layer.build(ClientLive)
          return yield* Effect.gen(function*() {
            const db = yield* PgliteDrizzle.makeWithDefaults()
            yield* migratePglite("./drizzle")
            yield* db.execute(sql`
              CREATE FUNCTION suppress_study_node_insert() RETURNS trigger AS $$
              BEGIN
                RETURN NULL;
              END;
              $$ LANGUAGE plpgsql
            `)
            yield* db.execute(sql`
              CREATE TRIGGER suppress_study_node_insert
              BEFORE INSERT ON ${studyNodes}
              FOR EACH ROW EXECUTE FUNCTION suppress_study_node_insert()
            `)

            const repository = makeStudyCatalogRepositoryDrizzle(db)
            const failure = yield* repository.createNode(country).pipe(Effect.flip)

            expect(failure).toMatchObject({
              _tag: "StudyCatalogRepositoryError",
              operation: "createNode",
              cause: { _tag: "MissingReturnedRow", operation: "createNode" },
            })
            expect(yield* db.select().from(studyNodes)).toEqual([])
          }).pipe(Effect.provide(context))
        }),
      ),
    )
  }, 15_000)

  test("decodes persisted node and edge discriminants without inferring kinds from branded IDs", () => {
    const ClientLive = PgliteClient.layer()

    return Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const context = yield* Layer.build(ClientLive)
          return yield* Effect.gen(function*() {
            const db = yield* PgliteDrizzle.makeWithDefaults()
            yield* migratePglite("./drizzle")
            yield* db.insert(studyNodes).values([
              {
                id: countryId,
                kind: "degree",
                name: "Persisted degree",
                imageAssetId: null,
                status: "published",
                createdAt: DateTime.toDateUtc(now),
                updatedAt: DateTime.toDateUtc(now),
              },
              {
                id: typeId,
                kind: "subject",
                name: "Persisted subject",
                imageAssetId: null,
                status: "published",
                createdAt: DateTime.toDateUtc(now),
                updatedAt: DateTime.toDateUtc(now),
              },
            ])
            yield* db.insert(studyEdges).values({
              id: edgeId,
              kind: "CountryTypeEdge",
              fromNodeId: countryId,
              toNodeId: typeId,
              position: 0,
            })

            const repository = makeStudyCatalogRepositoryDrizzle(db)
            const storedNode = Option.getOrThrow(
              yield* repository.findNodeById(countryId),
            )
            expect(storedNode).toBeInstanceOf(DegreeNode)
            expect(storedNode.kind).toBe("degree")

            const edgeFailure = yield* repository
              .findEdgeById(edgeId)
              .pipe(Effect.flip)
            const outgoingFailure = yield* repository
              .listOutgoingEdges(countryId)
              .pipe(Effect.flip)
            const targetFailure = yield* repository
              .listTargets(countryId)
              .pipe(Effect.flip)

            expect(edgeFailure).toMatchObject({
              _tag: "StudyCatalogRepositoryError",
            })
            expect(outgoingFailure).toMatchObject({
              _tag: "StudyCatalogRepositoryError",
            })
            expect(targetFailure).toMatchObject({
              _tag: "StudyCatalogRepositoryError",
            })
          }).pipe(Effect.provide(context))
        }),
      ),
    )
  }, 15_000)

  test("rejects persisted endpoint kinds that contradict the edge", () => {
    const ClientLive = PgliteClient.layer()

    return Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const context = yield* Layer.build(ClientLive)
          return yield* Effect.gen(function*() {
            const db = yield* PgliteDrizzle.makeWithDefaults()
            yield* migratePglite("./drizzle")
            yield* db.insert(studyNodes).values([
              {
                id: countryId,
                kind: "degree",
                name: "Wrong source",
                imageAssetId: null,
                status: "draft",
                createdAt: DateTime.toDateUtc(now),
                updatedAt: DateTime.toDateUtc(now),
              },
              {
                id: typeId,
                kind: "subject",
                name: "Wrong target",
                imageAssetId: null,
                status: "draft",
                createdAt: DateTime.toDateUtc(now),
                updatedAt: DateTime.toDateUtc(now),
              },
            ])
            const repository = makeStudyCatalogRepositoryDrizzle(db)

            const wrongSource = yield* repository
              .createEdge(edge)
              .pipe(Effect.flip)
            expect(wrongSource._tag).toBe("StudyEdgeEndpointKindMismatch")
            if (wrongSource._tag === "StudyEdgeEndpointKindMismatch") {
              expect(wrongSource.endpoint).toBe("from")
              expect(wrongSource.actualKind).toBe("degree")
            }

            yield* db
              .update(studyNodes)
              .set({ kind: "country" })
              .where(eq(studyNodes.id, countryId))
            const wrongTarget = yield* repository
              .createEdge(edge)
              .pipe(Effect.flip)
            expect(wrongTarget._tag).toBe("StudyEdgeEndpointKindMismatch")
            if (wrongTarget._tag === "StudyEdgeEndpointKindMismatch") {
              expect(wrongTarget.endpoint).toBe("to")
              expect(wrongTarget.actualKind).toBe("subject")
            }

            expect(yield* db.select().from(studyEdges)).toEqual([])
          }).pipe(Effect.provide(context))
        }),
      ),
    )
  }, 15_000)

  test("round-trips a node image asset relationship", () => {
    const ClientLive = PgliteClient.layer()
    const assetId = makeStudyAssetId(
      "00000000-0000-4000-8000-000000000201",
    )

    return Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          const context = yield* Layer.build(ClientLive)
          return yield* Effect.gen(function*() {
            const db = yield* PgliteDrizzle.makeWithDefaults()
            yield* migratePglite("./drizzle")
            yield* db.insert(studyAssets).values({
              id: assetId,
              storageKey: "study-catalog/countries/spain.webp",
              contentType: "image/webp",
              createdAt: DateTime.toDateUtc(now),
            })

            const repository = makeStudyCatalogRepositoryDrizzle(db)
            const nodeWithImage = new CountryNode({
              ...country,
              imageAssetId: assetId,
            })
            yield* repository.createNode(nodeWithImage)

            const stored = yield* repository.findNodeById(countryId)
            expect(Option.getOrThrow(stored).imageAssetId).toBe(assetId)
          }).pipe(Effect.provide(context))
        }),
      ),
    )
  }, 15_000)

  test("persists both university and degree paths to a subject", () =>
    Effect.runPromise(
      withRepository(
        Effect.gen(function*() {
          const repository = yield* StudyCatalogRepository
          const university = new UniversityNode({
            id: universityId,
            kind: "university",
            name: "Complutense University",
            imageAssetId: null,
            status: "published",
            createdAt: now,
            updatedAt: now,
          })
          const degree = new DegreeNode({
            id: degreeId,
            kind: "degree",
            name: "Computer Science",
            imageAssetId: null,
            status: "published",
            createdAt: now,
            updatedAt: now,
          })
          const subject = new SubjectNode({
            id: subjectId,
            kind: "subject",
            name: "Algebra",
            imageAssetId: null,
            status: "published",
            createdAt: now,
            updatedAt: now,
          })
          const universitySubject = new UniversitySubjectEdge({
            id: makeStudyEdgeId("00000000-0000-4000-8000-000000000103"),
            from: universityId,
            to: subjectId,
            position: 1,
          })
          const degreeSubject = new DegreeSubjectEdge({
            id: makeStudyEdgeId("00000000-0000-4000-8000-000000000104"),
            from: degreeId,
            to: subjectId,
            position: 0,
          })

          yield* repository.createNode(university)
          yield* repository.createNode(degree)
          yield* repository.createNode(subject)
          yield* repository.createEdge(universitySubject)
          yield* repository.createEdge(degreeSubject)

          expect(yield* repository.listTargets(universityId)).toEqual([subject])
          expect(yield* repository.listChildren({
            parentId: universityId,
            relationshipKinds: [
              "UniversityDegreeEdge",
              "UniversitySubjectEdge",
            ],
          })).toEqual([subject])
          expect(yield* repository.listTargets(degreeId)).toEqual([subject])
          expect(yield* repository.listSources(subjectId)).toEqual([
            university,
            degree,
          ])
        }),
      ),
    ),
    15_000,
  )

  test("transactionally inserts, moves and compacts edge order by source and tag", () =>
    Effect.runPromise(
      withRepository(
        Effect.gen(function*() {
          const repository = yield* StudyCatalogRepository
          const secondType = new StudyTypeNode({ ...studyType, id: secondTypeId, name: "Vocational" })
          const thirdType = new StudyTypeNode({ ...studyType, id: thirdTypeId, name: "Languages" })
          yield* repository.createNode(country)
          yield* repository.createNode(studyType)
          yield* repository.createNode(secondType)
          yield* repository.createNode(thirdType)

          const first = yield* repository.createEdge(edge, undefined)
          const second = yield* repository.createEdge(new CountryTypeEdge({
            id: makeStudyEdgeId("00000000-0000-4000-8000-000000000105"),
            from: countryId, to: secondTypeId, position: 0,
          }), undefined)
          const third = yield* repository.createEdge(new CountryTypeEdge({
            id: makeStudyEdgeId("00000000-0000-4000-8000-000000000106"),
            from: countryId, to: thirdTypeId, position: 0,
          }), 1)

          expect(first.position).toBe(0)
          expect(second.position).toBe(1)
          expect(third.position).toBe(1)
          expect((yield* repository.listOutgoingEdges(countryId)).map(({ id, position }) => [id, position])).toEqual([
            [first.id, 0], [third.id, 1], [second.id, 2],
          ])

          const moved = yield* repository.updateEdge(second.id, {
            from: countryId, to: secondTypeId, position: 0,
          })
          expect(moved).toEqual(new CountryTypeEdge({
            id: second.id, from: countryId, to: secondTypeId, position: 0,
          }))
          yield* repository.removeEdge(third.id)
          expect((yield* repository.listOutgoingEdges(countryId)).map(({ id, position }) => [id, position])).toEqual([
            [second.id, 0], [first.id, 1],
          ])

          const duplicate = yield* repository.updateEdge(first.id, {
            from: countryId, to: secondTypeId, position: 0,
          }).pipe(Effect.flip)
          expect(duplicate._tag).toBe("StudyEdgeAlreadyExists")
          yield* repository.createNode(new SubjectNode({
            id: subjectId, kind: "subject", name: "Algebra", imageAssetId: null,
            status: "draft", createdAt: now, updatedAt: now,
          }))
          const mismatch = yield* repository.updateEdge(first.id, {
            from: countryId, to: subjectId, position: 0,
          }).pipe(Effect.flip)
          expect(mismatch._tag).toBe("StudyEdgeEndpointKindMismatch")
        }),
      ),
    ),
    15_000,
  )

  test("applies complete public publication policy over the PGlite adapter", () =>
    Effect.runPromise(
      withRepository(
        Effect.gen(function*() {
          const repository = yield* StudyCatalogRepository
          const publishedType = new StudyTypeNode({
            ...studyType,
            id: secondTypeId,
            name: "Published studies",
            status: "published",
          })
          yield* Effect.forEach(
            [country, studyType, publishedType],
            repository.createNode,
            { discard: true },
          )
          const hiddenEdge = yield* repository.createEdge(
            new CountryTypeEdge({
              id: edgeId,
              from: countryId,
              to: typeId,
              position: 0,
            }),
          )
          const visibleEdge = yield* repository.createEdge(
            new CountryTypeEdge({
              id: makeStudyEdgeId(
                "00000000-0000-4000-8000-000000000109",
              ),
              from: countryId,
              to: secondTypeId,
              position: 1,
            }),
          )
          const allowAllAccess = Layer.succeed(
            AccessControlService,
            AccessControlService.of({
              capabilities: () => Effect.succeed(Access.permissions.all),
              require: () => Effect.void,
              grantRole: () => Effect.void,
              revokeRole: () => Effect.void,
            }),
          )
          const catalog = yield* Effect.scoped(
            Layer.build(StudyCatalogLive.pipe(
              Layer.provide(Layer.succeed(
                StudyCatalogRepository,
                repository,
              )),
              Layer.provide(allowAllAccess),
            )).pipe(Effect.map((service) =>
              Context.get(service, StudyCatalog),
            )),
          )

          expect(yield* catalog.getNode(typeId)).toEqual(studyType)
          expect((yield* catalog.getPublishedNode(typeId).pipe(Effect.flip))._tag)
            .toBe("StudyNodeNotFound")
          expect(yield* catalog.getEdge(hiddenEdge.id)).toEqual(hiddenEdge)
          expect((yield* catalog.getPublishedEdge(hiddenEdge.id).pipe(Effect.flip))._tag)
            .toBe("StudyEdgeNotFound")
          expect(yield* catalog.listPublishedOutgoingEdges(countryId)).toEqual([
            visibleEdge,
          ])
          expect(yield* catalog.listPublishedTargets(countryId)).toEqual([
            publishedType,
          ])
          expect((yield* catalog.listChildren(typeId).pipe(Effect.flip))._tag)
            .toBe("StudyNodeNotFound")
        }),
      ),
    ),
    15_000,
  )

  test("serializes concurrent create, move and remove operations by source", () =>
    Effect.runPromise(
      withRepository(
        Effect.gen(function*() {
          const repository = yield* StudyCatalogRepository
          const secondCountry = new CountryNode({
            ...country,
            id: secondCountryId,
            name: "Portugal",
          })
          const secondType = new StudyTypeNode({
            ...studyType,
            id: secondTypeId,
            name: "Vocational",
          })
          const thirdType = new StudyTypeNode({
            ...studyType,
            id: thirdTypeId,
            name: "Languages",
          })
          yield* Effect.forEach(
            [country, secondCountry, studyType, secondType, thirdType],
            repository.createNode,
            { discard: true },
          )
          const first = yield* repository.createEdge(new CountryTypeEdge({
            id: edgeId,
            from: countryId,
            to: typeId,
            position: 0,
          }))
          const second = yield* repository.createEdge(new CountryTypeEdge({
            id: makeStudyEdgeId("00000000-0000-4000-8000-000000000107"),
            from: countryId,
            to: secondTypeId,
            position: 0,
          }))
          const third = new CountryTypeEdge({
            id: makeStudyEdgeId("00000000-0000-4000-8000-000000000108"),
            from: countryId,
            to: thirdTypeId,
            position: 0,
          })

          yield* Effect.all([
            repository.updateEdge(first.id, {
              from: secondCountryId,
              to: typeId,
              position: 0,
            }),
            repository.removeEdge(second.id),
            repository.createEdge(third),
          ], { concurrency: "unbounded" })

          expect(yield* repository.listOutgoingEdges(countryId)).toEqual([
            new CountryTypeEdge({ ...third, position: 0 }),
          ])
          expect(yield* repository.listOutgoingEdges(secondCountryId)).toEqual([
            new CountryTypeEdge({
              id: first.id,
              from: secondCountryId,
              to: typeId,
              position: 0,
            }),
          ])
        }),
      ),
    ),
    15_000,
  )

  test("persists nodes, edges, graph queries, updates and domain failures", () =>
    Effect.runPromise(
      withRepository(
        Effect.gen(function*() {
          const repository = yield* StudyCatalogRepository

          yield* repository.createNode(country)
          yield* repository.createNode(studyType)

          const storedCountry = yield* repository.findNodeById(countryId)
          expect(Option.getOrThrow(storedCountry)).toEqual(country)

          const createdEdge = yield* repository.createEdge(edge)

          const outgoing = yield* repository.listOutgoingEdges(countryId)
          const incoming = yield* repository.listIncomingEdges(typeId)
          const targets = yield* repository.listTargets(countryId)
          const children = yield* repository.listChildren({
            parentId: countryId,
            relationshipKinds: ["CountryTypeEdge"],
          })
          const sources = yield* repository.listSources(typeId)

          expect(outgoing).toEqual([createdEdge])
          expect(incoming).toEqual([createdEdge])
          expect(targets).toEqual([studyType])
          expect(children).toEqual([])
          expect(yield* repository.listChildren({
            parentId: countryId,
            relationshipKinds: [],
          })).toEqual([])
          expect(sources).toEqual([country])

          const duplicate = yield* repository.createEdge(edge).pipe(Effect.flip)
          expect(duplicate._tag).toBe("StudyEdgeAlreadyExists")

          const missingEdge = new CountryTypeEdge({
            id: makeStudyEdgeId("00000000-0000-4000-8000-000000000102"),
            from: countryId,
            to: missingTypeId,
            position: 0,
          })
          const missingNode = yield* repository
            .createEdge(missingEdge)
            .pipe(Effect.flip)
          expect(missingNode._tag).toBe("StudyNodeNotFound")

          const renamed = yield* repository.renameNode(
            typeId,
            "Higher education",
            later,
          )
          expect(renamed.name).toBe("Higher education")

          const published = yield* repository.updateNodeStatus(typeId, "published", later)
          expect(published.status).toBe("published")
          const archived = yield* repository.updateNodeStatus(typeId, "archived", later)
          expect(archived.status).toBe("archived")
          const drafted = yield* repository.updateNodeStatus(typeId, "draft", later)
          expect(drafted.status).toBe("draft")

          yield* repository.removeEdge(edgeId)
          const removed = yield* repository.findEdgeById(edgeId)
          expect(Option.isNone(removed)).toBe(true)

          const missingRemoval = yield* repository
            .removeEdge(edgeId)
            .pipe(Effect.flip)
          expect(missingRemoval._tag).toBe("StudyEdgeNotFound")
        }),
      ),
    ),
    15_000,
  )
})
