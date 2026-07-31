import type { ProblemKind } from "@proxus/shared/auth"
import type { StudyNode } from "@proxus/shared/study-catalog"

export const problemKinds: ReadonlyArray<ProblemKind> = [
  "understand-content",
  "prepare-exams",
  "organize-study",
  "choose-studies",
  "other",
]

export const problemLabelKeys = {
  "understand-content": "problem.labels.understandContent",
  "prepare-exams": "problem.labels.prepareExams",
  "organize-study": "problem.labels.organizeStudy",
  "choose-studies": "problem.labels.chooseStudies",
  other: "problem.labels.other",
} as const satisfies Record<ProblemKind, string>

export const nodeLabelKeys = {
  country: "labels.country",
  type: "labels.type",
  university: "labels.university",
  degree: "labels.degree",
  subject: "labels.subject",
} as const satisfies Record<StudyNode["kind"], string>
