import type { StudyNode } from "@proxus/shared/study-catalog"
import { Schema } from "effect"
import { RegistrationPath } from "./model.js"

export const appendRegistrationNode = (
  path: RegistrationPath,
  node: StudyNode,
): RegistrationPath => {
  if (path.some((selected) => selected.id === node.id)) return path
  const candidate: ReadonlyArray<StudyNode> = [...path, node]
  return Schema.is(RegistrationPath)(candidate) ? candidate : path
}

export const goBackRegistrationPath = (
  path: RegistrationPath,
): RegistrationPath => {
  const candidate: ReadonlyArray<StudyNode> = path.slice(0, -1)
  return Schema.is(RegistrationPath)(candidate) ? candidate : []
}
