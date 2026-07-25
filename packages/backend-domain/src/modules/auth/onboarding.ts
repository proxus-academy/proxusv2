import type {
  OnboardingInput,
  ProblemKind,
  Username,
} from "@proxus/shared/auth"
import type {
  CountryNodeId,
  DegreeNodeId,
  StudyNode,
  StudyNodeId,
  StudyTypeNodeId,
  SubjectNodeId,
  UniversityNodeId,
} from "@proxus/shared/study-catalog"
import { Context, Data, Effect, Layer } from "effect"
import type { StudyCatalogRepositoryError } from "../study-catalog/repository.js"
import { StudyCatalog } from "../study-catalog/service.js"

export const earliestBirthYear = 1900
export const minimumRegistrationAge = 10

export type RegistrationProblem =
  | { readonly kind: Exclude<ProblemKind, "other"> }
  | { readonly kind: "other"; readonly otherText: string }

/** Catalog references validated at registration time. Deliberately contains no node names. */
export interface ValidatedStudyPath {
  readonly countryId: CountryNodeId
  readonly studyTypeId: StudyTypeNodeId
  readonly universityId: UniversityNodeId
  readonly degreeId: DegreeNodeId
  readonly subjectId: SubjectNodeId
  readonly nodeIds: readonly [CountryNodeId, StudyTypeNodeId, UniversityNodeId, DegreeNodeId, SubjectNodeId]
}

export interface RegistrationDraft {
  readonly username: Username
  readonly normalizedUsername: string
  readonly birthYear: number
  readonly problem: RegistrationProblem
  readonly study: ValidatedStudyPath
}

export class InvalidRegistrationDraft extends Data.TaggedError("InvalidRegistrationDraft")<{
  readonly field: "username" | "birthYear" | "problemOtherText"
  readonly reason: "invalid-format" | "out-of-range" | "required" | "not-allowed" | "too-long"
}> {}

export class InvalidStudyPath extends Data.TaggedError("InvalidStudyPath")<{
  readonly reason: "unpublished-node" | "unexpected-node-kind" | "non-contiguous" | "non-terminal"
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
        const ids = [input.countryId, input.studyTypeId, input.universityId, input.degreeId, input.subjectId] as const
        const expectedKinds = ["country", "type", "university", "degree", "subject"] as const
        const nodes: Array<StudyNode> = []

        for (const [index, id] of ids.entries()) {
          const node = yield* catalog.getPublishedNode(id).pipe(
            Effect.catchTag("StudyNodeNotFound", () => new InvalidStudyPath({ reason: "unpublished-node", nodeId: id })),
          )
          if (node.kind !== expectedKinds[index]) {
            return yield* new InvalidStudyPath({ reason: "unexpected-node-kind", nodeId: id })
          }
          nodes.push(node)
        }

        for (const [sourceId, targetId] of [[ids[0], ids[1]], [ids[1], ids[2]], [ids[2], ids[3]], [ids[3], ids[4]]] as const) {
          const targets = yield* catalog.listPublishedTargets(sourceId).pipe(
            Effect.catchTag("StudyNodeNotFound", () => new InvalidStudyPath({ reason: "unpublished-node", nodeId: sourceId })),
          )
          if (!targets.some(({ id }) => id === targetId)) {
            return yield* new InvalidStudyPath({ reason: "non-contiguous", nodeId: targetId })
          }
        }

        const terminal = nodes.at(-1)
        if (terminal === undefined) throw new Error("Validated study path unexpectedly has no terminal node")
        const terminalTargets = yield* catalog.listPublishedTargets(terminal.id).pipe(
          Effect.catchTag("StudyNodeNotFound", () => new InvalidStudyPath({ reason: "unpublished-node", nodeId: terminal.id })),
        )
        if (terminalTargets.length > 0) {
          return yield* new InvalidStudyPath({ reason: "non-terminal", nodeId: terminal.id })
        }

        return { ...input, nodeIds: ids }
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
  if (!Number.isInteger(currentYear) || input.birthYear < earliestBirthYear || input.birthYear > currentYear - minimumRegistrationAge) {
    return yield* new InvalidRegistrationDraft({ field: "birthYear", reason: "out-of-range" })
  }
  const problem = yield* makeProblem(input.problemKind, input.problemOtherText)
  const validator = yield* StudyPathValidator
  const study = yield* validator.validatePublishedPath(input.study)
  return {
    username: input.username,
    normalizedUsername,
    birthYear: input.birthYear,
    problem,
    study,
  } satisfies RegistrationDraft
})
