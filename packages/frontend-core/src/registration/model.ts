import {
  CountryNode,
  DegreeNode,
  StudyTypeNode,
  SubjectNode,
  StudyNodeId,
  UniversityNode,
} from "@proxus/shared/study-catalog"
import { Schema } from "effect"

const published = <Fields extends Schema.Struct.Fields>(fields: Fields) => Schema.Struct({
  ...fields,
  status: Schema.Literal("published"),
})

const PublishedStudyNode = Schema.Union([
  published(CountryNode.fields),
  published(StudyTypeNode.fields),
  published(UniversityNode.fields),
  published(DegreeNode.fields),
  published(SubjectNode.fields),
])

/** Published catalog nodes selected while traversing the study graph. */
export const RegistrationPath = Schema.Array(PublishedStudyNode)
export type RegistrationPath = typeof RegistrationPath.Type

/** Compact URL representation. Full node data remains in the persisted draft. */
export const RegistrationPathParam = Schema.fromJsonString(Schema.Array(StudyNodeId))
export type RegistrationPathParam = typeof RegistrationPathParam.Type
