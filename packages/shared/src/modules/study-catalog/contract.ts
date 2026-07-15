import { Schema } from "effect"
import { CreateStudyEdgeInput, CreateStudyNodeInput } from "./schema.js"

export const CreateStudyNodePayload = CreateStudyNodeInput
export type CreateStudyNodePayload = typeof CreateStudyNodePayload.Type

export const CreateStudyEdgePayload = CreateStudyEdgeInput
export type CreateStudyEdgePayload = typeof CreateStudyEdgePayload.Type

export class RenameStudyNodePayload extends Schema.Class<RenameStudyNodePayload>(
  "RenameStudyNodePayload",
)({
  name: Schema.NonEmptyString,
}) {}
