import type {
  CountryNode,
  CreateStudyEdgeInput,
  CreateStudyNodeInput,
  StudyEdge,
  StudyEdgeAlreadyExists,
  StudyEdgeEndpointKindMismatch,
  StudyEdgeId,
  StudyEdgeNotFound,
  StudyNode,
  StudyNodeId,
  StudyNodeKind,
  StudyNodeNotFound,
  StudyNodeStatus,
  UpdateStudyEdgePayload,
} from "@proxus/shared/study-catalog"
import { Context, Effect } from "effect"
import type { StudyCatalogRepositoryError } from "./repository.js"

export type ReadStudyNodeError =
  | StudyNodeNotFound
  | StudyCatalogRepositoryError

export type ReadStudyEdgeError =
  | StudyEdgeNotFound
  | StudyCatalogRepositoryError

export type CreateStudyNodeError = StudyCatalogRepositoryError

export type ConnectStudyNodesError =
  | StudyNodeNotFound
  | StudyEdgeEndpointKindMismatch
  | StudyEdgeAlreadyExists
  | StudyCatalogRepositoryError

export type UpdateStudyEdgeError =
  | StudyEdgeNotFound
  | StudyNodeNotFound
  | StudyEdgeEndpointKindMismatch
  | StudyEdgeAlreadyExists
  | StudyCatalogRepositoryError

export type DisconnectStudyNodesError =
  | StudyEdgeNotFound
  | StudyCatalogRepositoryError

export type UpdateStudyNodeError =
  | StudyNodeNotFound
  | StudyCatalogRepositoryError

/** Application API for nodes and typed directed edges in the study graph. */
export class StudyCatalog extends Context.Service<
  StudyCatalog,
  {
    readonly listNodes: (filters: {
      readonly kind: StudyNodeKind
      readonly status: StudyNodeStatus
    }) => Effect.Effect<
      ReadonlyArray<StudyNode>,
      StudyCatalogRepositoryError
    >

    readonly listCountries: () => Effect.Effect<
      ReadonlyArray<CountryNode>,
      StudyCatalogRepositoryError
    >

    readonly listRoots: () => Effect.Effect<
      ReadonlyArray<CountryNode>,
      StudyCatalogRepositoryError
    >

    readonly listChildren: (
      parentId: StudyNodeId,
    ) => Effect.Effect<ReadonlyArray<StudyNode>, ReadStudyNodeError>

    readonly createNode: (
      input: CreateStudyNodeInput,
    ) => Effect.Effect<StudyNode, CreateStudyNodeError>

    /** Administrative read: returns every persisted publication status. */
    readonly getNode: (
      nodeId: StudyNodeId,
    ) => Effect.Effect<StudyNode, ReadStudyNodeError>

    /** Public read: unpublished and archived nodes are indistinguishable from absence. */
    readonly getPublishedNode: (
      nodeId: StudyNodeId,
    ) => Effect.Effect<StudyNode, ReadStudyNodeError>

    readonly renameNode: (
      nodeId: StudyNodeId,
      name: string,
    ) => Effect.Effect<StudyNode, UpdateStudyNodeError>

    readonly updateNodeStatus: (
      nodeId: StudyNodeId,
      status: StudyNodeStatus,
    ) => Effect.Effect<StudyNode, UpdateStudyNodeError>

    readonly connect: (
      input: CreateStudyEdgeInput,
    ) => Effect.Effect<StudyEdge, ConnectStudyNodesError>

    readonly updateEdge: (
      edgeId: StudyEdgeId,
      input: UpdateStudyEdgePayload,
    ) => Effect.Effect<StudyEdge, UpdateStudyEdgeError>

    readonly disconnect: (
      edgeId: StudyEdgeId,
    ) => Effect.Effect<void, DisconnectStudyNodesError>

    /** Administrative read: does not apply publication filtering. */
    readonly getEdge: (
      edgeId: StudyEdgeId,
    ) => Effect.Effect<StudyEdge, ReadStudyEdgeError>

    /** Public read: visible only while both endpoint nodes are published. */
    readonly getPublishedEdge: (
      edgeId: StudyEdgeId,
    ) => Effect.Effect<StudyEdge, ReadStudyEdgeError>

    readonly listOutgoingEdges: (
      sourceNodeId: StudyNodeId,
    ) => Effect.Effect<ReadonlyArray<StudyEdge>, ReadStudyNodeError>

    readonly listIncomingEdges: (
      targetNodeId: StudyNodeId,
    ) => Effect.Effect<ReadonlyArray<StudyEdge>, ReadStudyNodeError>

    readonly listTargets: (
      sourceNodeId: StudyNodeId,
    ) => Effect.Effect<ReadonlyArray<StudyNode>, ReadStudyNodeError>

    readonly listSources: (
      targetNodeId: StudyNodeId,
    ) => Effect.Effect<ReadonlyArray<StudyNode>, ReadStudyNodeError>

    readonly listPublishedOutgoingEdges: (
      sourceNodeId: StudyNodeId,
    ) => Effect.Effect<ReadonlyArray<StudyEdge>, ReadStudyNodeError>

    readonly listPublishedIncomingEdges: (
      targetNodeId: StudyNodeId,
    ) => Effect.Effect<ReadonlyArray<StudyEdge>, ReadStudyNodeError>

    readonly listPublishedTargets: (
      sourceNodeId: StudyNodeId,
    ) => Effect.Effect<ReadonlyArray<StudyNode>, ReadStudyNodeError>

    readonly listPublishedSources: (
      targetNodeId: StudyNodeId,
    ) => Effect.Effect<ReadonlyArray<StudyNode>, ReadStudyNodeError>
  }
>()(
  "@proxus/backend-domain/modules/study-catalog/service/StudyCatalog",
) {}
