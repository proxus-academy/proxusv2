import { StudyAssetId } from "@proxus/shared/study-catalog"
import { Schema } from "effect"

export class StudyAsset extends Schema.Class<StudyAsset>("StudyAsset")({
  id: StudyAssetId,
  storageKey: Schema.NonEmptyString,
  contentType: Schema.NonEmptyString,
  createdAt: Schema.DateTimeUtcFromString,
}) {}
