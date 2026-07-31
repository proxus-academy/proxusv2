import type {
  OnboardingInput,
  ProblemKind,
  Username,
} from "@proxus/shared/auth"
import type { StudyNodeId, SubjectNodeId } from "@proxus/shared/study-catalog"
import { Context, Data, Effect, Layer } from "effect"
import type { StudyCatalogRepositoryError } from "../study-catalog/repository.js"
import { StudyCatalog } from "../study-catalog/service.js"

export const earliestBirthYear = 1900
export const maximumRegistrationAge = 100
export const minimumRegistrationAge = 13

export type RegistrationProblem =
  | { readonly kind: Exclude<ProblemKind, "other"> }
  | { readonly kind: "other"; readonly otherText: string }

/** Catalog references validated at registration time. Deliberately contains no node names. */
export interface ValidatedStudyPath {
  readonly studyId: StudyNodeId
  readonly subjectId: SubjectNodeId
}

export interface RegistrationDraft {
  readonly username: Username
  readonly normalizedUsername: string
  readonly birthYear: number
  readonly problem: RegistrationProblem
  readonly acquisition: {
    readonly source: OnboardingInput["acquisitionSource"]
    readonly otherText: string | null
  }
  readonly study: ValidatedStudyPath
}

export class InvalidRegistrationDraft extends Data.TaggedError("InvalidRegistrationDraft")<{
  readonly field: "username" | "birthYear" | "problemOtherText" | "acquisitionOtherText"
  readonly reason: "invalid-format" | "out-of-range" | "required" | "not-allowed" | "too-long"
}> {}

export class InvalidStudyPath extends Data.TaggedError("InvalidStudyPath")<{
  readonly reason: "unpublished-node" | "unexpected-node-kind" | "missing-study" | "ambiguous-study" | "non-terminal"
  readonly nodeId: StudyNodeId
}> {}

export type StudyPathValidationError = InvalidStudyPath | StudyCatalogRepositoryError

export class StudyPathValidator extends Context.Service<StudyPathValidator, {
  readonly validatePublishedPath: (input: OnboardingInput["study"]) => Effect.Effect<ValidatedStudyPath, StudyPathValidationError>
}>()("@proxus/backend-domain/modules/auth/onboarding/StudyPathValidator") {
  static readonly layer: Layer.Layer<StudyPathValidator, never, StudyCatalog> = Layer.effect(
    StudyPathValidator,
    Effect.gen(function*() {
      const catalog = yield* StudyCatalog
      const validatePublishedPath = Effect.fn("StudyPathValidator.validatePublishedPath")(function*(input: OnboardingInput["study"]) {
        const subject = yield* catalog.getPublishedNode(input.subjectId).pipe(
          Effect.catchTag("StudyNodeNotFound", () => new InvalidStudyPath({ reason: "unpublished-node", nodeId: input.subjectId })),
        )
        if (subject.kind !== "subject") {
          return yield* new InvalidStudyPath({ reason: "unexpected-node-kind", nodeId: input.subjectId })
        }
        const terminalTargets = yield* catalog.listPublishedTargets(subject.id).pipe(
          Effect.catchTag("StudyNodeNotFound", () => new InvalidStudyPath({ reason: "unpublished-node", nodeId: subject.id })),
        )
        if (terminalTargets.length > 0) {
          return yield* new InvalidStudyPath({ reason: "non-terminal", nodeId: subject.id })
        }
        const studies = yield* catalog.listPublishedSources(subject.id).pipe(
          Effect.catchTag("StudyNodeNotFound", () => new InvalidStudyPath({ reason: "unpublished-node", nodeId: subject.id })),
        )
        const study = studies.at(0)
        if (study === undefined) {
          return yield* new InvalidStudyPath({ reason: "missing-study", nodeId: subject.id })
        }
        if (studies.length !== 1) {
          return yield* new InvalidStudyPath({ reason: "ambiguous-study", nodeId: subject.id })
        }
        return { studyId: study.id, subjectId: input.subjectId }
      })
      return StudyPathValidator.of({ validatePublishedPath })
    }),
  )
}

const makeProblem = (kind: ProblemKind, otherText: string | undefined): Effect.Effect<RegistrationProblem, InvalidRegistrationDraft> => {
  const text = otherText?.trim()
  if (kind === "other") {
    if (text === undefined || text.length === 0) {
      return Effect.fail(new InvalidRegistrationDraft({ field: "problemOtherText", reason: "required" }))
    }
    if (text.length > 280) {
      return Effect.fail(new InvalidRegistrationDraft({ field: "problemOtherText", reason: "too-long" }))
    }
    return Effect.succeed({ kind, otherText: text })
  }
  if (text !== undefined && text.length > 0) {
    return Effect.fail(new InvalidRegistrationDraft({ field: "problemOtherText", reason: "not-allowed" }))
  }
  return Effect.succeed({ kind })
}

export const validateRegistrationDraft = Effect.fn("validateRegistrationDraft")(function*(
  input: OnboardingInput,
  currentYear: number,
) {
  const normalizedUsername = input.username.normalize("NFKC").toLocaleLowerCase("en-US")
  if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
    return yield* new InvalidRegistrationDraft({ field: "username", reason: "invalid-format" })
  }
  if (
    !Number.isInteger(currentYear)
    || input.birthYear < Math.max(earliestBirthYear, currentYear - maximumRegistrationAge)
    || input.birthYear > currentYear - minimumRegistrationAge
  ) {
    return yield* new InvalidRegistrationDraft({ field: "birthYear", reason: "out-of-range" })
  }
  const problem = yield* makeProblem(input.problemKind, input.problemOtherText)
  const acquisitionOther = input.acquisitionOtherText?.trim()
  if (input.acquisitionSource === "other" && (acquisitionOther === undefined || acquisitionOther.length === 0)) {
    return yield* new InvalidRegistrationDraft({ field: "acquisitionOtherText", reason: "required" })
  }
  if (input.acquisitionSource !== "other" && acquisitionOther !== undefined && acquisitionOther.length > 0) {
    return yield* new InvalidRegistrationDraft({ field: "acquisitionOtherText", reason: "not-allowed" })
  }
  const validator = yield* StudyPathValidator
  const study = yield* validator.validatePublishedPath(input.study)
  return {
    username: input.username,
    normalizedUsername,
    birthYear: input.birthYear,
    problem,
    acquisition: {
      source: input.acquisitionSource,
      otherText: input.acquisitionSource === "other" ? acquisitionOther ?? null : null,
    },
    study,
  } satisfies RegistrationDraft
})
