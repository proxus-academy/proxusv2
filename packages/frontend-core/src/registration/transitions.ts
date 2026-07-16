import type { StudyNode } from "@proxus/shared/study-catalog"
import { expectedTargetKinds, stepFromPath, type RegistrationPath } from "./model.js"

export const appendRegistrationNode = (
  path: RegistrationPath,
  node: StudyNode,
): RegistrationPath =>
  expectedTargetKinds(stepFromPath(path)).includes(node.kind)
    ? [...path, node]
    : path

export const goBackRegistrationPath = (
  path: RegistrationPath,
): RegistrationPath => path.slice(0, -1)
