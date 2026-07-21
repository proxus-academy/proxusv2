import type {
  CountryNode,
  StudyEdge,
  StudyNodeId,
  StudyEdgeAlreadyExists,
  StudyEdgeEndpointKindMismatch,
  StudyEdgeId,
  StudyEdgeNotFound,
  StudyNode,
  StudyNodeNotFound,
  StudyNodeKind,
  StudyNodeStatus,
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

    /** The persisted discriminator, not the caller's branded ID, determines the node variant. */
    readonly findNodeById: (
      nodeId: StudyNodeId,
    ) => Effect.Effect<
      Option.Option<StudyNode>,
      StudyCatalogRepositoryError
    >

    readonly findEdgeById: (
      edgeId: StudyEdgeId,
    ) => Effect.Effect<
      Option.Option<StudyEdge>,
      StudyCatalogRepositoryError
    >

    readonly createNode: (
      node: StudyNode,
    ) => Effect.Effect<StudyNode, StudyCatalogRepositoryError>

    readonly createEdge: (
      edge: StudyEdge,
      requestedPosition?: number,
    ) => Effect.Effect<
      StudyEdge,
      | StudyNodeNotFound
      | StudyEdgeEndpointKindMismatch
      | StudyEdgeAlreadyExists
      | StudyCatalogRepositoryError
    >

    readonly updateEdge: (
      edgeId: StudyEdgeId,
      input: {
        readonly from: StudyNodeId
        readonly to: StudyNodeId
        readonly position: number
      },
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

    readonly renameNode: (
      nodeId: StudyNodeId,
      name: string,
      updatedAt: StudyNode["updatedAt"],
    ) => Effect.Effect<
      StudyNode,
      StudyNodeNotFound | StudyCatalogRepositoryError
    >

    readonly updateNodeStatus: (
      nodeId: StudyNodeId,
      status: StudyNodeStatus,
      updatedAt: StudyNode["updatedAt"],
    ) => Effect.Effect<
      StudyNode,
      StudyNodeNotFound | StudyCatalogRepositoryError
    >

    readonly listOutgoingEdges: (
      sourceNodeId: StudyNodeId,
    ) => Effect.Effect<
      ReadonlyArray<StudyEdge>,
      StudyNodeNotFound | StudyCatalogRepositoryError
    >

    readonly listIncomingEdges: (
      targetNodeId: StudyNodeId,
    ) => Effect.Effect<
      ReadonlyArray<StudyEdge>,
      StudyNodeNotFound | StudyCatalogRepositoryError
    >

    readonly listTargets: (
      sourceNodeId: StudyNodeId,
    ) => Effect.Effect<
      ReadonlyArray<StudyNode>,
      StudyNodeNotFound | StudyCatalogRepositoryError
    >

    readonly listChildren: (input: {
      readonly parentId: StudyNodeId
      readonly relationshipKinds: ReadonlyArray<StudyEdge["_tag"]>
    }) => Effect.Effect<
      ReadonlyArray<StudyNode>,
      StudyCatalogRepositoryError
    >

    readonly listSources: (
      targetNodeId: StudyNodeId,
    ) => Effect.Effect<
      ReadonlyArray<StudyNode>,
      StudyNodeNotFound | StudyCatalogRepositoryError
    >
  }
>()(
  "@proxus/backend-domain/modules/study-catalog/repository/StudyCatalogRepository",
) {}
