import type { ProblemKind } from "@proxus/shared/auth"
import type { StudyNode } from "@proxus/shared/study-catalog"

export const problemLabels: ReadonlyArray<readonly [ProblemKind, string]> = [
  ["understand-content", "Entender mejor el contenido"],
  ["prepare-exams", "Preparar exámenes"],
  ["organize-study", "Organizar mi estudio"],
  ["choose-studies", "Elegir qué estudiar"],
  ["other", "Otro"],
]

export const nodeLabels: Record<StudyNode["kind"], string> = {
  country: "País",
  type: "Tipo de estudio",
  university: "Institución",
  degree: "Grado",
  subject: "Asignatura",
}
