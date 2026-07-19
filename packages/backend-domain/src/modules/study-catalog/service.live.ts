import {
  CountryNode,
  CountryTypeEdge,
  DegreeNode,
  DegreeSubjectEdge,
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
  type CreatedStudyEdge,
  type CreatedStudyNode,
  type CreateStudyEdgeInput,
  type CreateStudyNodeInput,
  type StudyEdge,
  type StudyEdgeId,
  type StudyEdgesFromId,
  type StudyEdgesToId,
  type StudyNodeId,
  type StudyNodeKind,
  type StudyNodeOfId,
  type StudyNodeSourcesOfId,
  type StudyNodeStatus,
  type StudyNodeTargetsOfId,
  type UpdateStudyEdgePayload,
} from "@proxus/shared/study-catalog"
import { Clock, DateTime, Effect, Layer, Option, Random } from "effect"
import { childRelationshipsFor } from "./model.js"
import {
  StudyCatalogRepository,
  type StudyCatalogRepositoryError,
} from "./repository.js"
import {
  StudyCatalog,
  type ConnectStudyNodesError,
  type CreateStudyNodeError,
  type ReadStudyEdgeError,
  type ReadStudyNodeError,
  type UpdateStudyNodeError,
} from "./service.js"

const randomUUIDv4 = Effect.gen(function*() {
  const bytes = yield* Effect.forEach(
    Array.from({ length: 16 }),
    () => Random.nextIntBetween(0, 255),
  )
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0"))
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-")
})

export const StudyCatalogLive: Layer.Layer<
  StudyCatalog,
  never,
  StudyCatalogRepository
> = Layer.effect(
  StudyCatalog,
  Effect.gen(function*() {
    const repository = yield* StudyCatalogRepository

    const listNodes = (filters: {
      readonly kind: StudyNodeKind
      readonly status: StudyNodeStatus
    }) => repository.listNodes(filters)

    const listCountries = () => repository.listCountries()
    const listRoots = () => repository.listCountries()

    const createNode = <Input extends CreateStudyNodeInput>(
      input: Input,
    ): Effect.Effect<CreatedStudyNode<Input>, CreateStudyNodeError> =>
      Effect.gen(function*() {
        const now = DateTime.makeUnsafe(yield* Clock.currentTimeMillis)

        switch (input._tag) {
          case "CreateCountry":
            return yield* repository.createNode(
              new CountryNode({
                id: makeCountryNodeId(yield* randomUUIDv4),
                kind: "country",
                name: input.name,
                imageAssetId: null,
                status: "draft",
                createdAt: now,
                updatedAt: now,
              }),
            )
          case "CreateStudyType":
            return yield* repository.createNode(
              new StudyTypeNode({
                id: makeStudyTypeNodeId(yield* randomUUIDv4),
                kind: "type",
                name: input.name,
                imageAssetId: null,
                status: "draft",
                createdAt: now,
                updatedAt: now,
              }),
            )
          case "CreateUniversity":
            return yield* repository.createNode(
              new UniversityNode({
                id: makeUniversityNodeId(yield* randomUUIDv4),
                kind: "university",
                name: input.name,
                imageAssetId: null,
                status: "draft",
                createdAt: now,
                updatedAt: now,
              }),
            )
          case "CreateDegree":
            return yield* repository.createNode(
              new DegreeNode({
                id: makeDegreeNodeId(yield* randomUUIDv4),
                kind: "degree",
                name: input.name,
                imageAssetId: null,
                status: "draft",
                createdAt: now,
                updatedAt: now,
              }),
            )
          case "CreateSubject":
            return yield* repository.createNode(
              new SubjectNode({
                id: makeSubjectNodeId(yield* randomUUIDv4),
                kind: "subject",
                name: input.name,
                imageAssetId: null,
                status: "draft",
                createdAt: now,
                updatedAt: now,
              }),
            )
        }
      }).pipe(Effect.map((node) => node as CreatedStudyNode<Input>))

    const connect = <Input extends CreateStudyEdgeInput>(
      input: Input,
    ): Effect.Effect<CreatedStudyEdge<Input>, ConnectStudyNodesError> =>
      Effect.gen(function*() {
        const id = makeStudyEdgeId(yield* randomUUIDv4)

        switch (input._tag) {
          case "CountryTypeEdge":
            return yield* repository.createEdge(
              new CountryTypeEdge({
                id,
                from: input.from,
                to: input.to,
                position: input.position ?? 0,
              }),
              input.position,
            )
          case "TypeUniversityEdge":
            return yield* repository.createEdge(
              new TypeUniversityEdge({
                id,
                from: input.from,
                to: input.to,
                position: input.position ?? 0,
              }),
              input.position,
            )
          case "UniversityDegreeEdge":
            return yield* repository.createEdge(
              new UniversityDegreeEdge({
                id,
                from: input.from,
                to: input.to,
                position: input.position ?? 0,
              }),
              input.position,
            )
          case "UniversitySubjectEdge":
            return yield* repository.createEdge(
              new UniversitySubjectEdge({
                id,
                from: input.from,
                to: input.to,
                position: input.position ?? 0,
              }),
              input.position,
            )
          case "DegreeSubjectEdge":
            return yield* repository.createEdge(
              new DegreeSubjectEdge({
                id,
                from: input.from,
                to: input.to,
                position: input.position ?? 0,
              }),
              input.position,
            )
        }
      }).pipe(Effect.map((edge) => edge as CreatedStudyEdge<Input>))

    const updateEdge = (
      edgeId: StudyEdgeId,
      input: UpdateStudyEdgePayload,
    ) => repository.updateEdge(edgeId, input)

    const getNode = <Id extends StudyNodeId>(
      nodeId: Id,
    ): Effect.Effect<StudyNodeOfId<Id>, ReadStudyNodeError> =>
      repository.findNodeById(nodeId).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new StudyNodeNotFound({ nodeId })),
            onSome: Effect.succeed,
          }),
        ),
      )

    const getPublicNode = <Id extends StudyNodeId>(nodeId: Id): Effect.Effect<StudyNodeOfId<Id>, ReadStudyNodeError> =>
      repository.findPublishedNodeById(nodeId).pipe(Effect.flatMap(Option.match({
        onNone: () => Effect.fail(new StudyNodeNotFound({ nodeId })),
        onSome: Effect.succeed,
      })))

    const getEdge = (
      edgeId: StudyEdgeId,
    ): Effect.Effect<StudyEdge, ReadStudyEdgeError> =>
      repository.findEdgeById(edgeId).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new StudyEdgeNotFound({ edgeId })),
            onSome: Effect.succeed,
          }),
        ),
      )

    const getPublicEdge = (edgeId: StudyEdgeId): Effect.Effect<StudyEdge, ReadStudyEdgeError> =>
      repository.findPublishedEdgeById(edgeId).pipe(Effect.flatMap(Option.match({
        onNone: () => Effect.fail(new StudyEdgeNotFound({ edgeId })),
        onSome: Effect.succeed,
      })))

    const renameNode = <Id extends StudyNodeId>(
      nodeId: Id,
      name: string,
    ): Effect.Effect<StudyNodeOfId<Id>, UpdateStudyNodeError> =>
      Clock.currentTimeMillis.pipe(
        Effect.flatMap((millis) =>
          repository.renameNode(
            nodeId,
            name,
            DateTime.makeUnsafe(millis),
          ),
        ),
      )

    const updateNodeStatus = <Id extends StudyNodeId>(
      nodeId: Id,
      status: StudyNodeStatus,
    ): Effect.Effect<StudyNodeOfId<Id>, UpdateStudyNodeError> =>
      Clock.currentTimeMillis.pipe(
        Effect.flatMap((millis) =>
          repository.updateNodeStatus(
            nodeId,
            status,
            DateTime.makeUnsafe(millis),
          ),
        ),
      )

    const disconnect = (edgeId: StudyEdgeId) =>
      repository.removeEdge(edgeId)

    const listOutgoingEdges = <Id extends StudyNodeId>(
      sourceNodeId: Id,
    ): Effect.Effect<
      ReadonlyArray<StudyEdgesFromId<Id>>,
      ReadStudyNodeError
    > => repository.listOutgoingEdges(sourceNodeId)

    const listPublicOutgoingEdges = <Id extends StudyNodeId>(sourceNodeId: Id) =>
      repository.listPublishedOutgoingEdges(sourceNodeId)

    const listIncomingEdges = <Id extends StudyNodeId>(
      targetNodeId: Id,
    ): Effect.Effect<
      ReadonlyArray<StudyEdgesToId<Id>>,
      ReadStudyNodeError
    > => repository.listIncomingEdges(targetNodeId)

    const listPublicIncomingEdges = <Id extends StudyNodeId>(targetNodeId: Id) =>
      repository.listPublishedIncomingEdges(targetNodeId)

    const listTargets = <Id extends StudyNodeId>(
      sourceNodeId: Id,
    ): Effect.Effect<
      ReadonlyArray<StudyNodeTargetsOfId<Id>>,
      ReadStudyNodeError
    > => repository.listTargets(sourceNodeId)

    const listChildren = <Id extends StudyNodeId>(
      parentId: Id,
    ): Effect.Effect<
      ReadonlyArray<StudyNodeTargetsOfId<Id>>,
      ReadStudyNodeError
    > =>
      getPublicNode(parentId).pipe(
        Effect.flatMap((parent) => repository.listChildren({
          parentId,
          relationshipKinds: childRelationshipsFor(parent.kind),
        })),
      )

    const listPublicTargets = <Id extends StudyNodeId>(sourceNodeId: Id) =>
      repository.listPublishedTargets(sourceNodeId)

    const listSources = <Id extends StudyNodeId>(
      targetNodeId: Id,
    ): Effect.Effect<
      ReadonlyArray<StudyNodeSourcesOfId<Id>>,
      ReadStudyNodeError
    > => repository.listSources(targetNodeId)

    const listPublicSources = <Id extends StudyNodeId>(targetNodeId: Id) =>
      repository.listPublishedSources(targetNodeId)

    return StudyCatalog.of({
      listNodes,
      listCountries,
      listRoots,
      listChildren,
      createNode,
      getNode,
      getPublicNode,
      renameNode,
      updateNodeStatus,
      connect,
      updateEdge,
      disconnect,
      getEdge,
      getPublicEdge,
      listOutgoingEdges,
      listPublicOutgoingEdges,
      listIncomingEdges,
      listPublicIncomingEdges,
      listTargets,
      listPublicTargets,
      listSources,
      listPublicSources,
    })
  }),
)
