import type {
  StudyEdge,
  StudyNodeId,
  StudyEdgeAlreadyExists,
  StudyEdgeEndpointKindMismatch,
  StudyEdgeId,
  StudyEdgeNotFound,
  StudyEdgesFromId,
  StudyEdgesToId,
  StudyNode,
  StudyNodeNotFound,
  StudyNodeOfId,
  StudyNodeSourcesOfId,
  StudyNodeTargetsOfId,
} from "@proxus/shared/study-catalog"
import { Context, Effect, Option, Schema } from "effect"

export class StudyCatalogRepositoryError extends Schema.TaggedErrorClass<StudyCatalogRepositoryError>()(
  "StudyCatalogRepositoryError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

/** Persistence port for the typed study graph. */
export class StudyCatalogRepository extends Context.Service<
  StudyCatalogRepository,
  {
    readonly findNodeById: <Id extends StudyNodeId>(
      nodeId: Id,
    ) => Effect.Effect<
      Option.Option<StudyNodeOfId<Id>>,
      StudyCatalogRepositoryError
    >

    readonly findEdgeById: (
      edgeId: StudyEdgeId,
    ) => Effect.Effect<
      Option.Option<StudyEdge>,
      StudyCatalogRepositoryError
    >

    readonly createNode: <Node extends StudyNode>(
      node: Node,
    ) => Effect.Effect<Node, StudyCatalogRepositoryError>

    readonly createEdge: <Edge extends StudyEdge>(
      edge: Edge,
    ) => Effect.Effect<
      Edge,
      | StudyNodeNotFound
      | StudyEdgeEndpointKindMismatch
      | StudyEdgeAlreadyExists
      | StudyCatalogRepositoryError
    >

    readonly removeEdge: (
      edgeId: StudyEdgeId,
    ) => Effect.Effect<
      void,
      StudyEdgeNotFound | StudyCatalogRepositoryError
    >

    readonly renameNode: <Id extends StudyNodeId>(
      nodeId: Id,
      name: string,
      updatedAt: StudyNode["updatedAt"],
    ) => Effect.Effect<
      StudyNodeOfId<Id>,
      StudyNodeNotFound | StudyCatalogRepositoryError
    >

    readonly archiveNode: <Id extends StudyNodeId>(
      nodeId: Id,
      updatedAt: StudyNode["updatedAt"],
    ) => Effect.Effect<
      StudyNodeOfId<Id>,
      StudyNodeNotFound | StudyCatalogRepositoryError
    >

    readonly listOutgoingEdges: <Id extends StudyNodeId>(
      sourceNodeId: Id,
    ) => Effect.Effect<
      ReadonlyArray<StudyEdgesFromId<Id>>,
      StudyNodeNotFound | StudyCatalogRepositoryError
    >

    readonly listIncomingEdges: <Id extends StudyNodeId>(
      targetNodeId: Id,
    ) => Effect.Effect<
      ReadonlyArray<StudyEdgesToId<Id>>,
      StudyNodeNotFound | StudyCatalogRepositoryError
    >

    readonly listTargets: <Id extends StudyNodeId>(
      sourceNodeId: Id,
    ) => Effect.Effect<
      ReadonlyArray<StudyNodeTargetsOfId<Id>>,
      StudyNodeNotFound | StudyCatalogRepositoryError
    >

    readonly listSources: <Id extends StudyNodeId>(
      targetNodeId: Id,
    ) => Effect.Effect<
      ReadonlyArray<StudyNodeSourcesOfId<Id>>,
      StudyNodeNotFound | StudyCatalogRepositoryError
    >
  }
>()(
  "@proxus/server/modules/study-catalog/repository/StudyCatalogRepository",
) {}
