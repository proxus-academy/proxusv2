import type { ProblemKind } from "@proxus/shared/auth"
import type { StudyNode } from "@proxus/shared/study-catalog"
import type { RegistrationStep } from "@proxus/frontend-core/registration"

export const problemLabels: ReadonlyArray<readonly [ProblemKind, string]> = [
  ["understand-content", "Entender mejor el contenido"],
  ["prepare-exams", "Preparar exámenes"],
  ["organize-study", "Organizar mi estudio"],
  ["choose-studies", "Elegir qué estudiar"],
  ["other", "Otro"],
]

export type StudyStep = "country" | "study-type" | "institution" | "degree" | "subject"

export const isStudyStep = (step: RegistrationStep): step is StudyStep =>
  step === "country"
  || step === "study-type"
  || step === "institution"
  || step === "degree"
  || step === "subject"

export const nodeLabels: Record<StudyNode["kind"], string> = {
  country: "País",
  type: "Tipo de estudio",
  university: "Institución",
  degree: "Grado",
  subject: "Asignatura",
}

export const studyStepTitles: Record<StudyStep, string> = {
  country: "Elige país",
  "study-type": "Elige tipo de estudio",
  institution: "Elige institución",
  degree: "Elige grado",
  subject: "Elige asignatura",
}

export const previousStudyStep: Record<StudyStep, RegistrationStep> = {
  country: "problem",
  "study-type": "country",
  institution: "study-type",
  degree: "institution",
  subject: "degree",
}
