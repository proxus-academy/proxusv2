import {
  StudyNode,
  type StudyNode as StudyNodeType,
} from "@proxus/shared/study-catalog"
import { Schema } from "effect"

export const RegistrationPathParam = Schema.fromJsonString(
  Schema.Array(StudyNode),
)

export type RegistrationPath = ReadonlyArray<StudyNodeType>

export type RegistrationStep =
  | "country"
  | "type"
  | "university"
  | "degree"
  | "subject"
  | "complete"

export const stepFromPath = (path: RegistrationPath): RegistrationStep => {
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
  step: RegistrationStep,
): ReadonlyArray<StudyNodeType["kind"]> => {
  switch (step) {
    case "country": return ["country"]
    case "type": return ["type"]
    case "university": return ["university"]
    case "degree": return ["degree"]
    case "subject": return ["subject"]
    case "complete": return []
  }
}
