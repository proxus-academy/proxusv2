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
} from "./contract.js"
import {
  StudyEdgeAlreadyExists,
  StudyEdgeEndpointKindMismatch,
  StudyEdgeNotFound,
  StudyNodeNotFound,
} from "./errors.js"
import {
  StudyEdge,
  StudyEdgeId,
  StudyNode,
  StudyNodeId,
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
    HttpApiEndpoint.post("archiveNode", "/nodes/:nodeId/archive", {
      params: { nodeId: StudyNodeId },
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
    HttpApiEndpoint.delete("disconnect", "/edges/:edgeId", {
      params: { edgeId: StudyEdgeId },
      success: HttpApiSchema.NoContent,
      error: edgeReadErrors,
    }),
  )
  .prefix("/admin/study-catalog") {}
