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
  type CreateStudyEdgeInput,
  type CreateStudyNodeInput,
  type StudyEdge,
  type StudyEdgeId,
  type StudyNode,
  type StudyNodeId,
  type StudyNodeKind,
  type StudyNodeStatus,
  type UpdateStudyEdgePayload,
} from "@proxus/shared/study-catalog"
import { Array, Clock, DateTime, Effect, Layer, Option, Random } from "effect"
import { Access, AccessControlService } from "../access-control/index.js"
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
    Array.makeBy(16, (index) => index),
    (index) => Random.nextIntBetween(0, 255).pipe(
      Effect.map((byte) =>
        index === 6
          ? (byte & 0x0f) | 0x40
          : index === 8
            ? (byte & 0x3f) | 0x80
            : byte),
    ),
  )
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
  StudyCatalogRepository | AccessControlService
> = Layer.effect(
  StudyCatalog,
  Effect.gen(function*() {
    const repository = yield* StudyCatalogRepository
    const accessControl = yield* AccessControlService
    const globalResource = Access.resource("studyCatalog", "global")
    const globalScope = Access.scope("studyCatalog", "global")
    const authorize = (permission: Parameters<typeof accessControl.require>[1], resource: Parameters<typeof accessControl.require>[2]) =>
      Effect.flatMap(Access.CurrentSubject, (subject) =>
        accessControl.require(subject, permission, resource))
    const nodeResource = (node: StudyNode) => Access.resource("studyNode", node.id, {
      scopes: [globalScope],
    })
    const edgeResource = (edge: StudyEdge) => Access.resource("studyEdge", edge.id, {
      scopes: [globalScope],
    })

    const listNodes = (filters: {
      readonly kind: StudyNodeKind
      readonly status: StudyNodeStatus
    }) => repository.listNodes(filters)

    const listCountries = () => repository.listCountries()
    const listRoots = () => repository.listCountries()
    const userCountsByNodeIds = repository.userCountsByNodeIds

    const createNode = (
      input: CreateStudyNodeInput,
    ): Effect.Effect<StudyNode, CreateStudyNodeError, typeof Access.CurrentSubject.Identifier> =>
      Effect.gen(function*() {
        yield* authorize("studyCatalog:createNode", globalResource)
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
      })

    const connect = (
      input: CreateStudyEdgeInput,
    ): Effect.Effect<StudyEdge, ConnectStudyNodesError, typeof Access.CurrentSubject.Identifier> =>
      Effect.gen(function*() {
        yield* authorize("studyCatalog:connect", globalResource)
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
      })

    const updateEdge = (
      edgeId: StudyEdgeId,
      input: UpdateStudyEdgePayload,
    ) => Effect.gen(function*() {
      yield* getEdge(edgeId)
      yield* authorize("studyCatalog:connect", globalResource)
      return yield* repository.updateEdge(edgeId, input)
    })

    const getNode = (
      nodeId: StudyNodeId,
    ): Effect.Effect<StudyNode, ReadStudyNodeError> =>
      repository.findNodeById(nodeId).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new StudyNodeNotFound({ nodeId })),
            onSome: Effect.succeed,
          }),
        ),
      )

    const getPublishedNode = (
      nodeId: StudyNodeId,
    ): Effect.Effect<StudyNode, ReadStudyNodeError> =>
      getNode(nodeId).pipe(
        Effect.flatMap((node) =>
          node.status === "published"
            ? Effect.succeed(node)
            : Effect.fail(new StudyNodeNotFound({ nodeId })),
        ),
      )

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

    const nodeIsPublished = (nodeId: StudyNodeId) =>
      repository.findNodeById(nodeId).pipe(
        Effect.map(Option.exists((node) => node.status === "published")),
      )

    const edgeIsPublished = (edge: StudyEdge) =>
      Effect.all([
        nodeIsPublished(edge.from),
        nodeIsPublished(edge.to),
      ]).pipe(Effect.map(([source, target]) => source && target))

    const filterPublishedEdges = (edges: ReadonlyArray<StudyEdge>) =>
      Effect.forEach(edges, (edge) =>
        edgeIsPublished(edge).pipe(
          Effect.map((published) =>
            published ? Option.some(edge) : Option.none<StudyEdge>(),
          ),
        ),
      ).pipe(Effect.map(Array.getSomes))

    const getPublishedEdge = (
      edgeId: StudyEdgeId,
    ): Effect.Effect<StudyEdge, ReadStudyEdgeError> =>
      getEdge(edgeId).pipe(
        Effect.flatMap((edge) =>
          edgeIsPublished(edge).pipe(
            Effect.flatMap((published) =>
              published
                ? Effect.succeed(edge)
                : Effect.fail(new StudyEdgeNotFound({ edgeId })),
            ),
          ),
        ),
      )

    const renameNode = (
      nodeId: StudyNodeId,
      name: string,
    ): Effect.Effect<StudyNode, UpdateStudyNodeError, typeof Access.CurrentSubject.Identifier> =>
      Effect.gen(function*() {
        const node = yield* getNode(nodeId)
        yield* authorize("studyNode:rename", nodeResource(node))
        const millis = yield* Clock.currentTimeMillis
        return yield* repository.renameNode(nodeId, name, DateTime.makeUnsafe(millis))
      })

    const updateNodeStatus = (
      nodeId: StudyNodeId,
      status: StudyNodeStatus,
    ): Effect.Effect<StudyNode, UpdateStudyNodeError, typeof Access.CurrentSubject.Identifier> =>
      Effect.gen(function*() {
        const node = yield* getNode(nodeId)
        yield* authorize("studyNode:archive", nodeResource(node))
        const millis = yield* Clock.currentTimeMillis
        return yield* repository.updateNodeStatus(nodeId, status, DateTime.makeUnsafe(millis))
      })

    const disconnect = (edgeId: StudyEdgeId) => Effect.gen(function*() {
      const edge = yield* getEdge(edgeId)
      yield* authorize("studyEdge:disconnect", edgeResource(edge))
      yield* repository.removeEdge(edgeId)
    })

    const listOutgoingEdges = (
      sourceNodeId: StudyNodeId,
    ): Effect.Effect<ReadonlyArray<StudyEdge>, ReadStudyNodeError> =>
      repository.listOutgoingEdges(sourceNodeId)

    const listIncomingEdges = (
      targetNodeId: StudyNodeId,
    ): Effect.Effect<ReadonlyArray<StudyEdge>, ReadStudyNodeError> =>
      repository.listIncomingEdges(targetNodeId)

    const listTargets = (
      sourceNodeId: StudyNodeId,
    ): Effect.Effect<ReadonlyArray<StudyNode>, ReadStudyNodeError> =>
      repository.listTargets(sourceNodeId)

    const listChildren = (
      parentId: StudyNodeId,
    ): Effect.Effect<ReadonlyArray<StudyNode>, ReadStudyNodeError> =>
      getPublishedNode(parentId).pipe(
        Effect.flatMap((parent) => repository.listChildren({
          parentId,
          relationshipKinds: childRelationshipsFor(parent.kind),
        })),
        Effect.map((nodes) =>
          nodes.filter(({ status }) => status === "published"),
        ),
      )

    const listSources = (
      targetNodeId: StudyNodeId,
    ): Effect.Effect<ReadonlyArray<StudyNode>, ReadStudyNodeError> =>
      repository.listSources(targetNodeId)

    const listPublishedOutgoingEdges = (sourceNodeId: StudyNodeId) =>
      getPublishedNode(sourceNodeId).pipe(
        Effect.andThen(repository.listOutgoingEdges(sourceNodeId)),
        Effect.flatMap(filterPublishedEdges),
      )

    const listPublishedIncomingEdges = (targetNodeId: StudyNodeId) =>
      getPublishedNode(targetNodeId).pipe(
        Effect.andThen(repository.listIncomingEdges(targetNodeId)),
        Effect.flatMap(filterPublishedEdges),
      )

    const listPublishedTargets = (sourceNodeId: StudyNodeId) =>
      getPublishedNode(sourceNodeId).pipe(
        Effect.andThen(repository.listTargets(sourceNodeId)),
        Effect.map((nodes) =>
          nodes.filter(({ status }) => status === "published"),
        ),
      )

    const listPublishedSources = (targetNodeId: StudyNodeId) =>
      getPublishedNode(targetNodeId).pipe(
        Effect.andThen(repository.listSources(targetNodeId)),
        Effect.map((nodes) =>
          nodes.filter(({ status }) => status === "published"),
        ),
      )

    return StudyCatalog.of({
      listNodes,
      listCountries,
      listRoots,
      ...(userCountsByNodeIds === undefined ? {} : { userCountsByNodeIds }),
      listChildren,
      createNode,
      getNode,
      getPublishedNode,
      renameNode,
      updateNodeStatus,
      connect,
      updateEdge,
      disconnect,
      getEdge,
      getPublishedEdge,
      listOutgoingEdges,
      listIncomingEdges,
      listTargets,
      listSources,
      listPublishedOutgoingEdges,
      listPublishedIncomingEdges,
      listPublishedTargets,
      listPublishedSources,
    })
  }),
)
