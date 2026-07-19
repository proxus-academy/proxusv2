import type {
  CountryNode,
  CreatedStudyEdge,
  CreatedStudyNode,
  CreateStudyEdgeInput,
  CreateStudyNodeInput,
  StudyEdge,
  StudyEdgeAlreadyExists,
  StudyEdgeEndpointKindMismatch,
  StudyEdgeId,
  StudyEdgeNotFound,
  StudyEdgesFromId,
  StudyEdgesToId,
  StudyNode,
  StudyNodeId,
  StudyNodeKind,
  StudyNodeNotFound,
  StudyNodeOfId,
  StudyNodeSourcesOfId,
  StudyNodeStatus,
  StudyNodeTargetsOfId,
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

    readonly listChildren: <Id extends StudyNodeId>(
      parentId: Id,
    ) => Effect.Effect<
      ReadonlyArray<StudyNodeTargetsOfId<Id>>,
      ReadStudyNodeError
    >

    readonly createNode: <Input extends CreateStudyNodeInput>(
      input: Input,
    ) => Effect.Effect<CreatedStudyNode<Input>, CreateStudyNodeError>

    readonly getNode: <Id extends StudyNodeId>(
      nodeId: Id,
    ) => Effect.Effect<StudyNodeOfId<Id>, ReadStudyNodeError>

    readonly getPublicNode: <Id extends StudyNodeId>(
      nodeId: Id,
    ) => Effect.Effect<StudyNodeOfId<Id>, ReadStudyNodeError>

    readonly renameNode: <Id extends StudyNodeId>(
      nodeId: Id,
      name: string,
    ) => Effect.Effect<StudyNodeOfId<Id>, UpdateStudyNodeError>

    readonly updateNodeStatus: <Id extends StudyNodeId>(
      nodeId: Id,
      status: StudyNodeStatus,
    ) => Effect.Effect<StudyNodeOfId<Id>, UpdateStudyNodeError>

    readonly connect: <Input extends CreateStudyEdgeInput>(
      input: Input,
    ) => Effect.Effect<CreatedStudyEdge<Input>, ConnectStudyNodesError>

    readonly updateEdge: (
      edgeId: StudyEdgeId,
      input: UpdateStudyEdgePayload,
    ) => Effect.Effect<StudyEdge, UpdateStudyEdgeError>

    readonly disconnect: (
      edgeId: StudyEdgeId,
    ) => Effect.Effect<void, DisconnectStudyNodesError>

    readonly getEdge: (
      edgeId: StudyEdgeId,
    ) => Effect.Effect<StudyEdge, ReadStudyEdgeError>

    readonly getPublicEdge: (
      edgeId: StudyEdgeId,
    ) => Effect.Effect<StudyEdge, ReadStudyEdgeError>

    readonly listOutgoingEdges: <Id extends StudyNodeId>(
      sourceNodeId: Id,
    ) => Effect.Effect<
      ReadonlyArray<StudyEdgesFromId<Id>>,
      ReadStudyNodeError
    >

    readonly listPublicOutgoingEdges: <Id extends StudyNodeId>(
      sourceNodeId: Id,
    ) => Effect.Effect<ReadonlyArray<StudyEdgesFromId<Id>>, ReadStudyNodeError>

    readonly listIncomingEdges: <Id extends StudyNodeId>(
      targetNodeId: Id,
    ) => Effect.Effect<
      ReadonlyArray<StudyEdgesToId<Id>>,
      ReadStudyNodeError
    >

    readonly listPublicIncomingEdges: <Id extends StudyNodeId>(
      targetNodeId: Id,
    ) => Effect.Effect<ReadonlyArray<StudyEdgesToId<Id>>, ReadStudyNodeError>

    readonly listTargets: <Id extends StudyNodeId>(
      sourceNodeId: Id,
    ) => Effect.Effect<
      ReadonlyArray<StudyNodeTargetsOfId<Id>>,
      ReadStudyNodeError
    >

    readonly listPublicTargets: <Id extends StudyNodeId>(
      sourceNodeId: Id,
    ) => Effect.Effect<ReadonlyArray<StudyNodeTargetsOfId<Id>>, ReadStudyNodeError>

    readonly listSources: <Id extends StudyNodeId>(
      targetNodeId: Id,
    ) => Effect.Effect<
      ReadonlyArray<StudyNodeSourcesOfId<Id>>,
      ReadStudyNodeError
    >

    readonly listPublicSources: <Id extends StudyNodeId>(
      targetNodeId: Id,
    ) => Effect.Effect<ReadonlyArray<StudyNodeSourcesOfId<Id>>, ReadStudyNodeError>
  }
>()(
  "@proxus/backend-domain/modules/study-catalog/service/StudyCatalog",
) {}
