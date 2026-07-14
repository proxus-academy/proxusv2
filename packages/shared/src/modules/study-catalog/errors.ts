import { Schema } from "effect"
import { StudyEdge, StudyEdgeId, StudyNodeId } from "./schema.js"

export class StudyNodeNotFound extends Schema.TaggedErrorClass<StudyNodeNotFound>()(
  "StudyNodeNotFound",
  { nodeId: StudyNodeId },
) {}

export class StudyEdgeNotFound extends Schema.TaggedErrorClass<StudyEdgeNotFound>()(
  "StudyEdgeNotFound",
  { edgeId: StudyEdgeId },
) {}

export class StudyEdgeAlreadyExists extends Schema.TaggedErrorClass<StudyEdgeAlreadyExists>()(
  "StudyEdgeAlreadyExists",
  { edge: StudyEdge },
) {}
