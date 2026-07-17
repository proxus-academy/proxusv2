import type { StudyEdgeNotFound, StudyNodeNotFound } from "@proxus/shared/study-catalog"
import type { MessagesCatalog } from "./catalog.js"

export type PublicStudyCatalogError = StudyNodeNotFound | StudyEdgeNotFound

const assertNever = (value: never): never => {
  throw new Error(`Unhandled public study catalog error: ${String(value)}`)
}

export const getStudyCatalogErrorMessage = (
  error: PublicStudyCatalogError,
  messages: MessagesCatalog,
): string => {
  switch (error._tag) {
    case "StudyNodeNotFound":
      return messages.errors.studyCatalog.nodeNotFound
    case "StudyEdgeNotFound":
      return messages.errors.studyCatalog.edgeNotFound
    default:
      return assertNever(error)
  }
}
