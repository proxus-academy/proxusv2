import {
  CountryNode,
  CreateCountryInput,
  CreateCountryTypeEdgeInput,
  CreateDegreeInput,
  CreateDegreeSubjectEdgeInput,
  CreateStudyTypeInput,
  CreateSubjectInput,
  CreateTypeUniversityEdgeInput,
  CreateUniversityDegreeEdgeInput,
  CreateUniversityInput,
  CreateUniversitySubjectEdgeInput,
  DegreeNode,
  DegreeSubjectEdge,
  StudyEdgeEndpointKindMismatch,
  StudyEdgeNotFound,
  StudyNodeNotFound,
  StudyTypeNode,
  SubjectNode,
  TypeUniversityEdge,
  UniversityDegreeEdge,
  UniversityNode,
  UniversitySubjectEdge,
  makeCountryNodeId,
  makeDegreeNodeId,
  makeStudyEdgeId,
  makeStudyTypeNodeId,
  makeSubjectNodeId,
  makeUniversityNodeId,
  type StudyEdge,
  type StudyNode,
} from "@proxus/shared/study-catalog"
import { describe, expect, test } from "vitest"
import {
  Clock,
  DateTime,
  Effect,
  Layer,
  Option,
  Random,
  Ref,
} from "effect"
import { StudyCatalogRepository } from "./repository.js"
import { StudyCatalogLive } from "./service.live.js"
import { StudyCatalog } from "./service.js"

const fixedMillis = Date.parse("2026-07-15T12:00:00.000Z")
const fixedDateTime = DateTime.makeUnsafe(fixedMillis)

const fixedClock: Clock.Clock = {
  currentTimeMillisUnsafe: () => fixedMillis,
  currentTimeMillis: Effect.succeed(fixedMillis),
  currentTimeNanosUnsafe: () => BigInt(fixedMillis) * 1_000_000n,
  currentTimeNanos: Effect.succeed(BigInt(fixedMillis) * 1_000_000n),
  sleep: () => Effect.void,
}

const fixedRandom: ContextRandom = {
  nextIntUnsafe: () => 0,
  nextDoubleUnsafe: () => 0,
}

type ContextRandom = typeof Random.Random.Service

type Recorded = {
  readonly nodes: ReadonlyArray<StudyNode>
  readonly edges: ReadonlyArray<StudyEdge>
}

const withCatalog = <A, E>(
  use: (
    catalog: typeof StudyCatalog.Service,
    recorded: Ref.Ref<Recorded>,
  ) => Effect.Effect<A, E>,
  options?: { readonly failEdges?: boolean },
) =>
  Effect.scoped(
    Effect.gen(function*() {
      const recorded = yield* Ref.make<Recorded>({ nodes: [], edges: [] })
      const repository = StudyCatalogRepository.of({
        listNodes: () => Effect.succeed([]),
        listCountries: () => Effect.succeed([]),
        findNodeById: () => Effect.succeed(Option.none()),
        findPublishedNodeById: () => Effect.succeed(Option.none()),
        findEdgeById: () => Effect.succeed(Option.none()),
        findPublishedEdgeById: () => Effect.succeed(Option.none()),
        createNode: (node) =>
          Ref.update(recorded, (state) => ({
            ...state,
            nodes: [...state.nodes, node],
          })).pipe(Effect.as(node)),
        createEdge: (edge) =>
          options?.failEdges === true
            ? Effect.fail(
                new StudyEdgeEndpointKindMismatch({
                  edge,
                  endpoint: "from",
                  nodeId: edge.from,
                  actualKind: "degree",
                }),
              )
            : Ref.update(recorded, (state) => ({
                ...state,
                edges: [...state.edges, edge],
              })).pipe(Effect.as(edge)),
        updateEdge: (edgeId) =>
          Effect.fail(new StudyEdgeNotFound({ edgeId })),
        removeEdge: (edgeId) =>
          Effect.fail(new StudyEdgeNotFound({ edgeId })),
        renameNode: (nodeId) =>
          Effect.fail(new StudyNodeNotFound({ nodeId })),
        updateNodeStatus: (nodeId) =>
          Effect.fail(new StudyNodeNotFound({ nodeId })),
        listOutgoingEdges: () => Effect.succeed([]),
        listPublishedOutgoingEdges: () => Effect.succeed([]),
        listIncomingEdges: () => Effect.succeed([]),
        listPublishedIncomingEdges: () => Effect.succeed([]),
        listTargets: () => Effect.succeed([]),
        listPublishedTargets: () => Effect.succeed([]),
        listChildren: () => Effect.succeed([]),
        listSources: () => Effect.succeed([]),
        listPublishedSources: () => Effect.succeed([]),
      })
      const context = yield* Layer.build(
        StudyCatalogLive.pipe(
          Layer.provide(Layer.succeed(StudyCatalogRepository, repository)),
        ),
      )
      const catalog = yield* StudyCatalog.pipe(Effect.provide(context))
      return yield* use(catalog, recorded)
    }),
  ).pipe(
    Effect.provideService(Clock.Clock, fixedClock),
    Effect.provideService(Random.Random, fixedRandom),
  )

const countryId = makeCountryNodeId("00000000-0000-4000-8000-000000000001")
const typeId = makeStudyTypeNodeId("00000000-0000-4000-8000-000000000002")
const universityId = makeUniversityNodeId(
  "00000000-0000-4000-8000-000000000003",
)
const degreeId = makeDegreeNodeId("00000000-0000-4000-8000-000000000004")
const subjectId = makeSubjectNodeId("00000000-0000-4000-8000-000000000005")

describe("StudyCatalogLive", () => {
  test("constructs every node variant with application defaults", () =>
    Effect.runPromise(
      withCatalog((catalog, recorded) =>
        Effect.gen(function*() {
          const nodes = [
            yield* catalog.createNode(new CreateCountryInput({ name: "Spain" })),
            yield* catalog.createNode(
              new CreateStudyTypeInput({ name: "University studies" }),
            ),
            yield* catalog.createNode(
              new CreateUniversityInput({ name: "Complutense" }),
            ),
            yield* catalog.createNode(
              new CreateDegreeInput({ name: "Computer Science" }),
            ),
            yield* catalog.createNode(
              new CreateSubjectInput({ name: "Algebra" }),
            ),
          ]

          expect(nodes[0]).toBeInstanceOf(CountryNode)
          expect(nodes[1]).toBeInstanceOf(StudyTypeNode)
          expect(nodes[2]).toBeInstanceOf(UniversityNode)
          expect(nodes[3]).toBeInstanceOf(DegreeNode)
          expect(nodes[4]).toBeInstanceOf(SubjectNode)
          for (const node of nodes) {
            expect(node.status).toBe("draft")
            expect(node.imageAssetId).toBeNull()
            expect(node.createdAt).toEqual(fixedDateTime)
            expect(node.updatedAt).toEqual(fixedDateTime)
          }
          expect((yield* Ref.get(recorded)).nodes).toEqual(nodes)
        }),
      ),
    ),
  )

  test("constructs every edge variant and applies the default position", () =>
    Effect.runPromise(
      withCatalog((catalog, recorded) =>
        Effect.gen(function*() {
          const edges = [
            yield* catalog.connect(
              new CreateCountryTypeEdgeInput({ from: countryId, to: typeId }),
            ),
            yield* catalog.connect(
              new CreateTypeUniversityEdgeInput({
                from: typeId,
                to: universityId,
                position: 2,
              }),
            ),
            yield* catalog.connect(
              new CreateUniversityDegreeEdgeInput({
                from: universityId,
                to: degreeId,
              }),
            ),
            yield* catalog.connect(
              new CreateUniversitySubjectEdgeInput({
                from: universityId,
                to: subjectId,
              }),
            ),
            yield* catalog.connect(
              new CreateDegreeSubjectEdgeInput({
                from: degreeId,
                to: subjectId,
              }),
            ),
          ]

          expect(edges[1]).toBeInstanceOf(TypeUniversityEdge)
          expect(edges[2]).toBeInstanceOf(UniversityDegreeEdge)
          expect(edges[3]).toBeInstanceOf(UniversitySubjectEdge)
          expect(edges[4]).toBeInstanceOf(DegreeSubjectEdge)
          expect(edges.map(({ position }) => position)).toEqual([0, 2, 0, 0, 0])
          expect((yield* Ref.get(recorded)).edges).toEqual(edges)
        }),
      ),
    ),
  )

  test("maps missing records and preserves typed repository failures", () =>
    Effect.runPromise(
      withCatalog(
        (catalog) =>
          Effect.gen(function*() {
            const missingNode = yield* catalog.getNode(countryId).pipe(Effect.flip)
            expect(missingNode._tag).toBe("StudyNodeNotFound")

            const missingPublicNode = yield* catalog.getPublicNode(countryId).pipe(Effect.flip)
            expect(missingPublicNode._tag).toBe("StudyNodeNotFound")
            const missingPublicChildren = yield* catalog.listChildren(countryId).pipe(Effect.flip)
            expect(missingPublicChildren._tag).toBe("StudyNodeNotFound")

            const missingEdgeId = makeStudyEdgeId("00000000-0000-4000-8000-000000000009")
            const missingEdge = yield* catalog.getEdge(missingEdgeId).pipe(Effect.flip)
            expect(missingEdge._tag).toBe("StudyEdgeNotFound")
            const missingPublicEdge = yield* catalog.getPublicEdge(missingEdgeId).pipe(Effect.flip)
            expect(missingPublicEdge._tag).toBe("StudyEdgeNotFound")

            expect(yield* catalog.listPublicOutgoingEdges(countryId)).toEqual([])
            expect(yield* catalog.listPublicIncomingEdges(typeId)).toEqual([])
            expect(yield* catalog.listPublicTargets(countryId)).toEqual([])
            expect(yield* catalog.listPublicSources(typeId)).toEqual([])

            const mismatch = yield* catalog
              .connect(
                new CreateCountryTypeEdgeInput({
                  from: countryId,
                  to: typeId,
                }),
              )
              .pipe(Effect.flip)
            expect(mismatch._tag).toBe("StudyEdgeEndpointKindMismatch")
          }),
        { failEdges: true },
      ),
    ),
  )
})
