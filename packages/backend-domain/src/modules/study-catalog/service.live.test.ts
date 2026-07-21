import {
  CountryNode,
  CountryTypeEdge,
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
  type StudyNodeId,
} from "@proxus/shared/study-catalog"
import { describe, expect, test } from "vitest"
import {
  Clock,
  Context,
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
        findEdgeById: () => Effect.succeed(Option.none()),
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
        listIncomingEdges: () => Effect.succeed([]),
        listTargets: () => Effect.succeed([]),
        listChildren: () => Effect.succeed([]),
        listSources: () => Effect.succeed([]),
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
const publishedTypeId = makeStudyTypeNodeId(
  "00000000-0000-4000-8000-000000000006",
)

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

            const missingEdge = yield* catalog
              .getEdge(makeStudyEdgeId("00000000-0000-4000-8000-000000000009"))
              .pipe(Effect.flip)
            expect(missingEdge._tag).toBe("StudyEdgeNotFound")

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

  test("filters every public graph read while admin reads remain unfiltered", () => {
    const publishedCountry = new CountryNode({
      id: countryId,
      kind: "country",
      name: "Spain",
      imageAssetId: null,
      status: "published",
      createdAt: fixedDateTime,
      updatedAt: fixedDateTime,
    })
    const draftType = new StudyTypeNode({
      id: typeId,
      kind: "type",
      name: "Draft studies",
      imageAssetId: null,
      status: "draft",
      createdAt: fixedDateTime,
      updatedAt: fixedDateTime,
    })
    const publishedType = new StudyTypeNode({
      ...draftType,
      id: publishedTypeId,
      name: "Published studies",
      status: "published",
    })
    const hiddenEdge = new CountryTypeEdge({
      id: makeStudyEdgeId("00000000-0000-4000-8000-000000000010"),
      from: countryId,
      to: typeId,
      position: 0,
    })
    const visibleEdge = new CountryTypeEdge({
      id: makeStudyEdgeId("00000000-0000-4000-8000-000000000011"),
      from: countryId,
      to: publishedTypeId,
      position: 1,
    })
    const nodes: ReadonlyArray<StudyNode> = [
      publishedCountry,
      draftType,
      publishedType,
    ]
    const edges: ReadonlyArray<StudyEdge> = [hiddenEdge, visibleEdge]
    const findNode = (nodeId: StudyNodeId) =>
      Option.fromNullishOr(nodes.find(({ id }) => id === nodeId))
    const repository = StudyCatalogRepository.of({
      listNodes: ({ kind, status }) => Effect.succeed(
        nodes.filter((node) => node.kind === kind && node.status === status),
      ),
      listCountries: () => Effect.succeed([publishedCountry]),
      findNodeById: (nodeId) => Effect.succeed(findNode(nodeId)),
      findEdgeById: (edgeId) => Effect.succeed(
        Option.fromNullishOr(edges.find(({ id }) => id === edgeId)),
      ),
      createNode: Effect.succeed,
      createEdge: (studyEdge) => Effect.succeed(studyEdge),
      updateEdge: (studyEdgeId) => Effect.fail(
        new StudyEdgeNotFound({ edgeId: studyEdgeId }),
      ),
      removeEdge: (studyEdgeId) => Effect.fail(
        new StudyEdgeNotFound({ edgeId: studyEdgeId }),
      ),
      renameNode: (nodeId) => Effect.fail(new StudyNodeNotFound({ nodeId })),
      updateNodeStatus: (nodeId) => Effect.fail(
        new StudyNodeNotFound({ nodeId }),
      ),
      listOutgoingEdges: (nodeId) => Effect.succeed(
        edges.filter(({ from }) => from === nodeId),
      ),
      listIncomingEdges: (nodeId) => Effect.succeed(
        edges.filter(({ to }) => to === nodeId),
      ),
      listTargets: (nodeId) => Effect.succeed(
        edges.filter(({ from }) => from === nodeId).flatMap(({ to }) =>
          Option.toArray(findNode(to)),
        ),
      ),
      listChildren: ({ parentId }) => Effect.succeed(
        edges.filter(({ from }) => from === parentId).flatMap(({ to }) =>
          Option.toArray(findNode(to)),
        ),
      ),
      listSources: (nodeId) => Effect.succeed(
        edges.filter(({ to }) => to === nodeId).flatMap(({ from }) =>
          Option.toArray(findNode(from)),
        ),
      ),
    })

    return Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const context = yield* Layer.build(StudyCatalogLive.pipe(Layer.provide(
        Layer.succeed(StudyCatalogRepository, repository),
      )))
      const catalog = Context.get(context, StudyCatalog)

      expect(yield* catalog.getNode(typeId)).toEqual(draftType)
      expect((yield* catalog.getPublishedNode(typeId).pipe(Effect.flip))._tag)
        .toBe("StudyNodeNotFound")
      expect(yield* catalog.getEdge(hiddenEdge.id)).toEqual(hiddenEdge)
      expect((yield* catalog.getPublishedEdge(hiddenEdge.id).pipe(Effect.flip))._tag)
        .toBe("StudyEdgeNotFound")
      expect(yield* catalog.getPublishedEdge(visibleEdge.id)).toEqual(visibleEdge)

      expect(yield* catalog.listOutgoingEdges(countryId)).toEqual(edges)
      expect(yield* catalog.listTargets(countryId)).toEqual([
        draftType,
        publishedType,
      ])
      expect(yield* catalog.listPublishedOutgoingEdges(countryId)).toEqual([
        visibleEdge,
      ])
      expect(yield* catalog.listPublishedTargets(countryId)).toEqual([
        publishedType,
      ])
      expect(yield* catalog.listPublishedIncomingEdges(publishedTypeId))
        .toEqual([visibleEdge])
      expect(yield* catalog.listPublishedSources(publishedTypeId)).toEqual([
        publishedCountry,
      ])
      expect(yield* catalog.listChildren(countryId)).toEqual([publishedType])
      expect((yield* catalog.listChildren(typeId).pipe(Effect.flip))._tag)
        .toBe("StudyNodeNotFound")
      expect((yield* catalog.listPublishedIncomingEdges(typeId).pipe(Effect.flip))._tag)
        .toBe("StudyNodeNotFound")
    })))
  })
})
