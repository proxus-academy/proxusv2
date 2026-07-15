import type {
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
  StudyNodeId,
  StudyNodeNotFound,
  StudyNodeOfId,
  StudyNodeSourcesOfId,
  StudyNodeTargetsOfId,
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
    readonly createNode: <Input extends CreateStudyNodeInput>(
      input: Input,
    ) => Effect.Effect<CreatedStudyNode<Input>, CreateStudyNodeError>

    readonly getNode: <Id extends StudyNodeId>(
      nodeId: Id,
    ) => Effect.Effect<StudyNodeOfId<Id>, ReadStudyNodeError>

    readonly renameNode: <Id extends StudyNodeId>(
      nodeId: Id,
      name: string,
    ) => Effect.Effect<StudyNodeOfId<Id>, UpdateStudyNodeError>

    readonly archiveNode: <Id extends StudyNodeId>(
      nodeId: Id,
    ) => Effect.Effect<StudyNodeOfId<Id>, UpdateStudyNodeError>

    readonly connect: <Input extends CreateStudyEdgeInput>(
      input: Input,
    ) => Effect.Effect<CreatedStudyEdge<Input>, ConnectStudyNodesError>

    readonly disconnect: (
      edgeId: StudyEdgeId,
    ) => Effect.Effect<void, DisconnectStudyNodesError>

    readonly getEdge: (
      edgeId: StudyEdgeId,
    ) => Effect.Effect<StudyEdge, ReadStudyEdgeError>

    readonly listOutgoingEdges: <Id extends StudyNodeId>(
      sourceNodeId: Id,
    ) => Effect.Effect<
      ReadonlyArray<StudyEdgesFromId<Id>>,
      ReadStudyNodeError
    >

    readonly listIncomingEdges: <Id extends StudyNodeId>(
      targetNodeId: Id,
    ) => Effect.Effect<
      ReadonlyArray<StudyEdgesToId<Id>>,
      ReadStudyNodeError
    >

    readonly listTargets: <Id extends StudyNodeId>(
      sourceNodeId: Id,
    ) => Effect.Effect<
      ReadonlyArray<StudyNodeTargetsOfId<Id>>,
      ReadStudyNodeError
    >

    readonly listSources: <Id extends StudyNodeId>(
      targetNodeId: Id,
    ) => Effect.Effect<
      ReadonlyArray<StudyNodeSourcesOfId<Id>>,
      ReadStudyNodeError
    >
  }
>()(
  "@proxus/server/modules/study-catalog/service/StudyCatalog",
) {}
