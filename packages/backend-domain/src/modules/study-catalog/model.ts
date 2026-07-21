import {
  StudyAssetId,
  type StudyEdge,
  type StudyNodeKind,
} from "@proxus/shared/study-catalog"
import { Match, Schema } from "effect"

export class StudyAsset extends Schema.Class<StudyAsset>("StudyAsset")({
  id: StudyAssetId,
  storageKey: Schema.NonEmptyString,
  contentType: Schema.NonEmptyString,
  createdAt: Schema.DateTimeUtcFromString,
}) {}

type StudyRelationshipKind = StudyEdge["_tag"]

/** Relationships exposed as children for each parent node kind. */
export const childRelationshipsFor = (
  kind: StudyNodeKind,
): ReadonlyArray<StudyRelationshipKind> =>
  Match.value(kind).pipe(
    Match.when("country", () => ["CountryTypeEdge"] as const),
    Match.when("type", () => ["TypeUniversityEdge"] as const),
    Match.when("university", () => [
      "UniversityDegreeEdge",
      "UniversitySubjectEdge",
    ] as const),
    Match.when("degree", () => ["DegreeSubjectEdge"] as const),
    Match.when("subject", () => []),
    Match.exhaustive,
  )
