import {
  CountryNode,
  DegreeNode,
  StudyTypeNode,
  SubjectNode,
  UniversityNode,
  type StudyNode,
} from "@proxus/shared/study-catalog"
import { Schema } from "effect"

const published = <Fields extends Schema.Struct.Fields>(fields: Fields) => Schema.Struct({
  ...fields,
  status: Schema.Literal("published"),
})

const PublishedCountryNode = published(CountryNode.fields)
const PublishedStudyTypeNode = published(StudyTypeNode.fields)
const PublishedUniversityNode = published(UniversityNode.fields)
const PublishedDegreeNode = published(DegreeNode.fields)
const PublishedSubjectNode = published(SubjectNode.fields)

/** Every navigable registration prefix, with published nodes in graph order. */
export const RegistrationPath = Schema.Union([
  Schema.Tuple([]),
  Schema.Tuple([PublishedCountryNode]),
  Schema.Tuple([PublishedCountryNode, PublishedStudyTypeNode]),
  Schema.Tuple([PublishedCountryNode, PublishedStudyTypeNode, PublishedUniversityNode]),
  Schema.Tuple([PublishedCountryNode, PublishedStudyTypeNode, PublishedUniversityNode, PublishedDegreeNode]),
  Schema.Tuple([
    PublishedCountryNode,
    PublishedStudyTypeNode,
    PublishedUniversityNode,
    PublishedDegreeNode,
    PublishedSubjectNode,
  ]),
])
export type RegistrationPath = typeof RegistrationPath.Type

export const RegistrationPathParam = Schema.fromJsonString(RegistrationPath)

export type CatalogRegistrationStep =
  | "country"
  | "type"
  | "university"
  | "degree"
  | "subject"
  | "complete"

export const stepFromPath = (path: RegistrationPath): CatalogRegistrationStep => {
  const selected = path.at(-1)
  if (selected === undefined) return "country"

  switch (selected.kind) {
    case "country": return "type"
    case "type": return "university"
    case "university": return "degree"
    case "degree": return "subject"
    case "subject": return "complete"
  }
}

export const expectedTargetKinds = (
  step: CatalogRegistrationStep,
): ReadonlyArray<StudyNode["kind"]> => {
  switch (step) {
    case "country": return ["country"]
    case "type": return ["type"]
    case "university": return ["university"]
    case "degree": return ["degree"]
    case "subject": return ["subject"]
    case "complete": return []
  }
}
