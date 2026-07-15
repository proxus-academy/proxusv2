import { Schema } from "effect"
import {
  StudyEdge,
  StudyEdgeId,
  StudyNodeId,
  StudyNodeKind,
} from "./schema.js"

export class StudyNodeNotFound extends Schema.TaggedErrorClass<StudyNodeNotFound>()(
  "StudyNodeNotFound",
  { nodeId: StudyNodeId },
  { httpApiStatus: 404 },
) {}

export class StudyEdgeNotFound extends Schema.TaggedErrorClass<StudyEdgeNotFound>()(
  "StudyEdgeNotFound",
  { edgeId: StudyEdgeId },
  { httpApiStatus: 404 },
) {}

export class StudyEdgeEndpointKindMismatch extends Schema.TaggedErrorClass<StudyEdgeEndpointKindMismatch>()(
  "StudyEdgeEndpointKindMismatch",
  {
    edge: StudyEdge,
    endpoint: Schema.Literals(["from", "to"]),
    nodeId: StudyNodeId,
    actualKind: StudyNodeKind,
  },
  { httpApiStatus: 422 },
) {}

export class StudyEdgeAlreadyExists extends Schema.TaggedErrorClass<StudyEdgeAlreadyExists>()(
  "StudyEdgeAlreadyExists",
  { edge: StudyEdge },
  { httpApiStatus: 409 },
) {}
