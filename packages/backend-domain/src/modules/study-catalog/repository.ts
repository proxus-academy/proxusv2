import type {
  CountryNode,
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
  StudyNodeKind,
  StudyNodeOfId,
  StudyNodeStatus,
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

    readonly findNodeById: <Id extends StudyNodeId>(
      nodeId: Id,
    ) => Effect.Effect<Option.Option<StudyNodeOfId<Id>>, StudyCatalogRepositoryError>

    /** Public lookup: unpublished nodes are indistinguishable from missing nodes. */
    readonly findPublishedNodeById: <Id extends StudyNodeId>(
      nodeId: Id,
    ) => Effect.Effect<Option.Option<StudyNodeOfId<Id>>, StudyCatalogRepositoryError>

    readonly findEdgeById: (
      edgeId: StudyEdgeId,
    ) => Effect.Effect<
      Option.Option<StudyEdge>,
      StudyCatalogRepositoryError
    >

    /** Public lookup: an edge is visible only when both endpoint nodes are published. */
    readonly findPublishedEdgeById: (
      edgeId: StudyEdgeId,
    ) => Effect.Effect<Option.Option<StudyEdge>, StudyCatalogRepositoryError>

    readonly createNode: <Node extends StudyNode>(
      node: Node,
    ) => Effect.Effect<Node, StudyCatalogRepositoryError>

    readonly createEdge: <Edge extends StudyEdge>(
      edge: Edge,
      requestedPosition?: number,
    ) => Effect.Effect<
      Edge,
      | StudyNodeNotFound
      | StudyEdgeEndpointKindMismatch
      | StudyEdgeAlreadyExists
      | StudyCatalogRepositoryError
    >

    readonly updateEdge: (
      edgeId: StudyEdgeId,
      input: { readonly from: StudyNodeId; readonly to: StudyNodeId; readonly position: number },
    ) => Effect.Effect<
      StudyEdge,
      | StudyEdgeNotFound
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

    readonly updateNodeStatus: <Id extends StudyNodeId>(
      nodeId: Id,
      status: StudyNodeStatus,
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

    readonly listPublishedOutgoingEdges: <Id extends StudyNodeId>(
      sourceNodeId: Id,
    ) => Effect.Effect<ReadonlyArray<StudyEdgesFromId<Id>>, StudyNodeNotFound | StudyCatalogRepositoryError>

    readonly listIncomingEdges: <Id extends StudyNodeId>(
      targetNodeId: Id,
    ) => Effect.Effect<
      ReadonlyArray<StudyEdgesToId<Id>>,
      StudyNodeNotFound | StudyCatalogRepositoryError
    >

    readonly listPublishedIncomingEdges: <Id extends StudyNodeId>(
      targetNodeId: Id,
    ) => Effect.Effect<ReadonlyArray<StudyEdgesToId<Id>>, StudyNodeNotFound | StudyCatalogRepositoryError>

    readonly listTargets: <Id extends StudyNodeId>(
      sourceNodeId: Id,
    ) => Effect.Effect<
      ReadonlyArray<StudyNodeTargetsOfId<Id>>,
      StudyNodeNotFound | StudyCatalogRepositoryError
    >

    readonly listPublishedTargets: <Id extends StudyNodeId>(
      sourceNodeId: Id,
    ) => Effect.Effect<ReadonlyArray<StudyNodeTargetsOfId<Id>>, StudyNodeNotFound | StudyCatalogRepositoryError>

    readonly listChildren: <Id extends StudyNodeId>(
      input: {
        readonly parentId: Id
        readonly relationshipKinds: ReadonlyArray<StudyEdge["_tag"]>
      },
    ) => Effect.Effect<
      ReadonlyArray<StudyNodeTargetsOfId<Id>>,
      StudyCatalogRepositoryError
    >

    readonly listPublishedSources: <Id extends StudyNodeId>(
      targetNodeId: Id,
    ) => Effect.Effect<ReadonlyArray<StudyNodeSourcesOfId<Id>>, StudyNodeNotFound | StudyCatalogRepositoryError>

    readonly listSources: <Id extends StudyNodeId>(
      targetNodeId: Id,
    ) => Effect.Effect<
      ReadonlyArray<StudyNodeSourcesOfId<Id>>,
      StudyNodeNotFound | StudyCatalogRepositoryError
    >
  }
>()(
  "@proxus/backend-domain/modules/study-catalog/repository/StudyCatalogRepository",
) {}
