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
) {}

export class StudyEdgeNotFound extends Schema.TaggedErrorClass<StudyEdgeNotFound>()(
  "StudyEdgeNotFound",
  { edgeId: StudyEdgeId },
) {}

export class StudyEdgeEndpointKindMismatch extends Schema.TaggedErrorClass<StudyEdgeEndpointKindMismatch>()(
  "StudyEdgeEndpointKindMismatch",
  {
    edge: StudyEdge,
    endpoint: Schema.Literals(["from", "to"]),
    nodeId: StudyNodeId,
    actualKind: StudyNodeKind,
  },
) {}

export class StudyEdgeAlreadyExists extends Schema.TaggedErrorClass<StudyEdgeAlreadyExists>()(
  "StudyEdgeAlreadyExists",
  { edge: StudyEdge },
) {}
