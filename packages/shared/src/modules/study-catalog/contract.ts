import { Schema } from "effect"
import {
  CreateStudyEdgeInput,
  CreateStudyNodeInput,
  NonNegativeInt,
  StudyNodeId,
} from "./schema.js"

export const CreateStudyNodePayload = CreateStudyNodeInput
export type CreateStudyNodePayload = typeof CreateStudyNodePayload.Type

export const CreateStudyEdgePayload = CreateStudyEdgeInput
export type CreateStudyEdgePayload = typeof CreateStudyEdgePayload.Type

export class UpdateStudyEdgePayload extends Schema.Class<UpdateStudyEdgePayload>(
  "UpdateStudyEdgePayload",
)({
  from: StudyNodeId,
  to: StudyNodeId,
  position: NonNegativeInt,
}) {}

export class RenameStudyNodePayload extends Schema.Class<RenameStudyNodePayload>(
  "RenameStudyNodePayload",
)({
  name: Schema.NonEmptyString,
}) {}
