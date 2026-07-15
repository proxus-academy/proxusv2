import { PgliteClient } from "@effect/sql-pglite"
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
  makeStudyEdgeId,
  makeStudyTypeNodeId,
  makeSubjectNodeId,
  makeUniversityNodeId,
} from "@proxus/shared/study-catalog"
import { describe, expect, test } from "vitest"
import { DateTime, Effect, Layer, Option } from "effect"
import { migratePglite } from "../../../infrastructure/database/pglite.js"
import { StudyCatalogRepository } from "../repository.js"
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

const country = new CountryNode({
  id: countryId,
  kind: "country",
  name: "Spain",
  status: "published",
  createdAt: now,
  updatedAt: now,
})

const studyType = new StudyTypeNode({
  id: typeId,
  kind: "type",
  name: "University studies",
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
  test("persists both university and degree paths to a subject", () =>
    Effect.runPromise(
      withRepository(
        Effect.gen(function*() {
          const repository = yield* StudyCatalogRepository
          const university = new UniversityNode({
            id: universityId,
            kind: "university",
            name: "Complutense University",
            status: "published",
            createdAt: now,
            updatedAt: now,
          })
          const degree = new DegreeNode({
            id: degreeId,
            kind: "degree",
            name: "Computer Science",
            status: "published",
            createdAt: now,
            updatedAt: now,
          })
          const subject = new SubjectNode({
            id: subjectId,
            kind: "subject",
            name: "Algebra",
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
          expect(yield* repository.listTargets(degreeId)).toEqual([subject])
          expect(yield* repository.listSources(subjectId)).toEqual([
            degree,
            university,
          ])
        }),
      ),
    ),
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

          yield* repository.createEdge(edge)

          const outgoing = yield* repository.listOutgoingEdges(countryId)
          const incoming = yield* repository.listIncomingEdges(typeId)
          const targets = yield* repository.listTargets(countryId)
          const sources = yield* repository.listSources(typeId)

          expect(outgoing).toEqual([edge])
          expect(incoming).toEqual([edge])
          expect(targets).toEqual([studyType])
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

          const archived = yield* repository.archiveNode(typeId, later)
          expect(archived.status).toBe("archived")

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
  )
})
