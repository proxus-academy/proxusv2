import { Schema } from "effect"
import {
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi"
import {
  CreateStudyEdgePayload,
  CreateStudyNodePayload,
  RenameStudyNodePayload,
  UpdateStudyEdgePayload,
} from "./contract.js"
import {
  StudyEdgeAlreadyExists,
  StudyEdgeEndpointKindMismatch,
  StudyEdgeNotFound,
  StudyNodeNotFound,
} from "./errors.js"
import {
  CountryNode,
  StudyEdge,
  StudyEdgeId,
  StudyNode,
  StudyNodeId,
  StudyNodeKind,
  StudyNodeStatus,
} from "./schema.js"

const nodeReadErrors = [
  StudyNodeNotFound,
  HttpApiError.InternalServerErrorNoContent,
] as const

const edgeReadErrors = [
  StudyEdgeNotFound,
  HttpApiError.InternalServerErrorNoContent,
] as const

export class PublicStudyCatalogApi extends HttpApiGroup.make(
  "publicStudyCatalog",
)
  .add(
    HttpApiEndpoint.get("listCountries", "/countries", {
      success: Schema.Array(CountryNode),
      error: HttpApiError.InternalServerErrorNoContent,
    }),
    HttpApiEndpoint.get("listRoots", "/nodes/children", {
      success: Schema.Array(CountryNode),
      error: HttpApiError.InternalServerErrorNoContent,
    }),
    HttpApiEndpoint.get("listChildren", "/nodes/children/:nodeId", {
      params: { nodeId: StudyNodeId },
      success: Schema.Array(StudyNode),
      error: nodeReadErrors,
    }),
    HttpApiEndpoint.get("getNode", "/nodes/:nodeId", {
      params: { nodeId: StudyNodeId },
      success: StudyNode,
      error: nodeReadErrors,
    }),
    HttpApiEndpoint.get("getEdge", "/edges/:edgeId", {
      params: { edgeId: StudyEdgeId },
      success: StudyEdge,
      error: edgeReadErrors,
    }),
    HttpApiEndpoint.get("listOutgoingEdges", "/nodes/:nodeId/outgoing-edges", {
      params: { nodeId: StudyNodeId },
      success: Schema.Array(StudyEdge),
      error: nodeReadErrors,
    }),
    HttpApiEndpoint.get("listIncomingEdges", "/nodes/:nodeId/incoming-edges", {
      params: { nodeId: StudyNodeId },
      success: Schema.Array(StudyEdge),
      error: nodeReadErrors,
    }),
    HttpApiEndpoint.get("listTargets", "/nodes/:nodeId/targets", {
      params: { nodeId: StudyNodeId },
      success: Schema.Array(StudyNode),
      error: nodeReadErrors,
    }),
    HttpApiEndpoint.get("listSources", "/nodes/:nodeId/sources", {
      params: { nodeId: StudyNodeId },
      success: Schema.Array(StudyNode),
      error: nodeReadErrors,
    }),
  )
  .prefix("/study-catalog") {}

export class AdminStudyCatalogApi extends HttpApiGroup.make(
  "adminStudyCatalog",
)
  .add(
    HttpApiEndpoint.get("listNodes", "/nodes", {
      query: {
        kind: StudyNodeKind,
        status: StudyNodeStatus,
      },
      success: Schema.Array(StudyNode),
      error: HttpApiError.InternalServerErrorNoContent,
    }),
    HttpApiEndpoint.get("getNode", "/nodes/:nodeId", {
      params: { nodeId: StudyNodeId },
      success: StudyNode,
      error: nodeReadErrors,
    }),
    HttpApiEndpoint.get("listOutgoingEdges", "/nodes/:nodeId/outgoing-edges", {
      params: { nodeId: StudyNodeId },
      success: Schema.Array(StudyEdge),
      error: nodeReadErrors,
    }),
    HttpApiEndpoint.get("listIncomingEdges", "/nodes/:nodeId/incoming-edges", {
      params: { nodeId: StudyNodeId },
      success: Schema.Array(StudyEdge),
      error: nodeReadErrors,
    }),
    HttpApiEndpoint.get("listTargets", "/nodes/:nodeId/targets", {
      params: { nodeId: StudyNodeId },
      success: Schema.Array(StudyNode),
      error: nodeReadErrors,
    }),
    HttpApiEndpoint.get("listSources", "/nodes/:nodeId/sources", {
      params: { nodeId: StudyNodeId },
      success: Schema.Array(StudyNode),
      error: nodeReadErrors,
    }),
    HttpApiEndpoint.post("createNode", "/nodes", {
      payload: CreateStudyNodePayload,
      success: StudyNode.pipe(HttpApiSchema.status("Created")),
      error: HttpApiError.InternalServerErrorNoContent,
    }),
    HttpApiEndpoint.patch("renameNode", "/nodes/:nodeId/name", {
      params: { nodeId: StudyNodeId },
      payload: RenameStudyNodePayload,
      success: StudyNode,
      error: nodeReadErrors,
    }),
    HttpApiEndpoint.patch("updateNodeStatus", "/nodes/:nodeId/status", {
      params: { nodeId: StudyNodeId },
      payload: StudyNodeStatus,
      success: StudyNode,
      error: nodeReadErrors,
    }),
    HttpApiEndpoint.post("connect", "/edges", {
      payload: CreateStudyEdgePayload,
      success: StudyEdge.pipe(HttpApiSchema.status("Created")),
      error: [
        StudyNodeNotFound,
        StudyEdgeEndpointKindMismatch,
        StudyEdgeAlreadyExists,
        HttpApiError.InternalServerErrorNoContent,
      ],
    }),
    HttpApiEndpoint.patch("updateEdge", "/edges/:edgeId", {
      params: { edgeId: StudyEdgeId },
      payload: UpdateStudyEdgePayload,
      success: StudyEdge,
      error: [
        StudyEdgeNotFound,
        StudyNodeNotFound,
        StudyEdgeEndpointKindMismatch,
        StudyEdgeAlreadyExists,
        HttpApiError.InternalServerErrorNoContent,
      ],
    }),
    HttpApiEndpoint.delete("disconnect", "/edges/:edgeId", {
      params: { edgeId: StudyEdgeId },
      success: HttpApiSchema.NoContent,
      error: edgeReadErrors,
    }),
  )
  .prefix("/admin/study-catalog") {}
