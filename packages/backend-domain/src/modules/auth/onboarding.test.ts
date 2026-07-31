import { OnboardingInput } from "@proxus/shared/auth"
import {
  CountryNode,
  DegreeNode,
  StudyTypeNode,
  StudyNodeNotFound,
  SubjectNode,
  UniversityNode,
  makeCountryNodeId,
  makeDegreeNodeId,
  makeStudyTypeNodeId,
  makeSubjectNodeId,
  makeUniversityNodeId,
  type StudyNode,
  type StudyNodeId,
} from "@proxus/shared/study-catalog"
import { DateTime, Effect, Layer, Schema } from "effect"
import { describe, expect, test } from "vitest"
import { StudyCatalog } from "../study-catalog/service.js"
import { StudyPathValidator, validateRegistrationDraft } from "./onboarding.js"

const ids = {
  countryId: makeCountryNodeId("00000000-0000-4000-8000-000000000001"),
  studyTypeId: makeStudyTypeNodeId("00000000-0000-4000-8000-000000000002"),
  universityId: makeUniversityNodeId("00000000-0000-4000-8000-000000000003"),
  degreeId: makeDegreeNodeId("00000000-0000-4000-8000-000000000004"),
  subjectId: makeSubjectNodeId("00000000-0000-4000-8000-000000000005"),
}
const now = DateTime.makeUnsafe(Date.parse("2026-01-01T00:00:00Z"))
const fields = { name: "must-not-be-persisted", imageAssetId: null, status: "published" as const, createdAt: now, updatedAt: now }
const nodes: ReadonlyArray<StudyNode> = [
  new CountryNode({ ...fields, id: ids.countryId, kind: "country" }),
  new StudyTypeNode({ ...fields, id: ids.studyTypeId, kind: "type" }),
  new UniversityNode({ ...fields, id: ids.universityId, kind: "university" }),
  new DegreeNode({ ...fields, id: ids.degreeId, kind: "degree" }),
  new SubjectNode({ ...fields, id: ids.subjectId, kind: "subject" }),
]
const decodeInput = (overrides: Record<string, unknown> = {}) => Schema.decodeUnknownSync(OnboardingInput)({
  username: "Learner_1",
  birthYear: 2000,
  problemKind: "understand-content",
  acquisitionSource: "friend",
  study: { subjectId: ids.subjectId },
  ...overrides,
})
const run = (input: OnboardingInput, catalog = makeCatalog()) => Effect.runPromise(
  validateRegistrationDraft(input, 2026).pipe(
    // Test entry point: provide the complete graph once before running it.
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(StudyPathValidator.layer.pipe(Layer.provide(Layer.succeed(StudyCatalog, catalog)))),
  ),
)

const unavailable = () => Effect.die("unused")
const makeCatalog = (options: {
  readonly nodes?: ReadonlyArray<StudyNode>
  readonly terminalChild?: boolean
  readonly studies?: ReadonlyArray<StudyNode>
} = {}): typeof StudyCatalog.Service => {
  const available = options.nodes ?? nodes
  const terminalChild = nodes.find(({ kind }) => kind === "country")
  if (terminalChild === undefined) throw new Error("Expected country fixture")
  return StudyCatalog.of({
    listNodes: unavailable, listCountries: unavailable, listRoots: unavailable, listChildren: unavailable,
    createNode: unavailable, getNode: unavailable, renameNode: unavailable, updateNodeStatus: unavailable,
    connect: unavailable, updateEdge: unavailable, disconnect: unavailable, getEdge: unavailable,
    getPublishedEdge: unavailable, listOutgoingEdges: unavailable, listIncomingEdges: unavailable,
    listTargets: unavailable, listSources: unavailable, listPublishedOutgoingEdges: unavailable,
    listPublishedIncomingEdges: unavailable,
    getPublishedNode: (id) => {
      const node = available.find((candidate) => candidate.id === id)
      return node === undefined
        ? Effect.fail(new StudyNodeNotFound({ nodeId: id }))
        : Effect.succeed(node)
    },
    listPublishedTargets: (sourceId) => {
      if (sourceId === ids.subjectId) return Effect.succeed(options.terminalChild === true ? [terminalChild] : [])
      return Effect.succeed([])
    },
    listPublishedSources: () => Effect.succeed(options.studies ?? nodes.filter(({ kind }) => kind === "degree")),
  })
}

describe("onboarding domain validation", () => {
  test.each([1926, 2013])("accepts birth-year boundary %i", (birthYear) =>
    expect(run(decodeInput({ birthYear }))).resolves.toMatchObject({ birthYear }),
  )

  test.each([1925, 2014])("rejects birth year outside the supported range: %i", (birthYear) =>
    expect(run(decodeInput({ birthYear }))).rejects.toMatchObject({ _tag: "InvalidRegistrationDraft", field: "birthYear" }),
  )

  test("requires trimmed other text only for the other problem", () => Promise.all([
    expect(run(decodeInput({ problemKind: "other" }))).rejects.toMatchObject({ field: "problemOtherText", reason: "required" }),
    expect(run(decodeInput({ problemKind: "other", problemOtherText: "  A specific need  " }))).resolves.toMatchObject({ problem: { kind: "other", otherText: "A specific need" } }),
    expect(run(decodeInput({ problemOtherText: "injected" }))).rejects.toMatchObject({ reason: "not-allowed" }),
  ]))

  test("accepts other text at the contract limit", () =>
    expect(run(decodeInput({ problemKind: "other", problemOtherText: "x".repeat(280) }))).resolves.toMatchObject({ problem: { kind: "other" } }),
  )

  test("requires acquisition detail only for other", () => Promise.all([
    expect(run(decodeInput({ acquisitionSource: "other" }))).rejects.toMatchObject({
      field: "acquisitionOtherText",
      reason: "required",
    }),
    expect(run(decodeInput({
      acquisitionSource: "other",
      acquisitionOtherText: "  Una asociación estudiantil  ",
    }))).resolves.toMatchObject({
      acquisition: { source: "other", otherText: "Una asociación estudiantil" },
    }),
    expect(run(decodeInput({ acquisitionOtherText: "injected" }))).rejects.toMatchObject({
      field: "acquisitionOtherText",
      reason: "not-allowed",
    }),
  ]))

  test("normalizes username", () =>
    expect(run(decodeInput())).resolves.toMatchObject({ normalizedUsername: "learner_1" }),
  )

  test("accepts a terminal subject and derives its study from the unique parent", () =>
    run(decodeInput()).then((draft) => {
      expect(draft.study).toEqual({ studyId: ids.degreeId, subjectId: ids.subjectId })
      expect(JSON.stringify(draft)).not.toContain("must-not-be-persisted")
      expect(Object.keys(draft.study)).not.toContain("name")
    }),
  )

  test("rejects missing, ambiguous and non-terminal study assignments", () => Promise.all([
    expect(run(decodeInput(), makeCatalog({ studies: [] }))).rejects.toMatchObject({ _tag: "InvalidStudyPath", reason: "missing-study" }),
    expect(run(decodeInput(), makeCatalog({
      studies: nodes.filter(({ kind }) => kind === "university" || kind === "degree"),
    }))).rejects.toMatchObject({ reason: "ambiguous-study" }),
    expect(run(decodeInput(), makeCatalog({ terminalChild: true }))).rejects.toMatchObject({ reason: "non-terminal" }),
  ]))

  test("rejects unpublished and client-manipulated subject kinds", () => {
    const manipulated = nodes.map((node) => node.id === ids.subjectId
      ? new DegreeNode({ ...fields, id: makeDegreeNodeId(ids.subjectId), kind: "degree" })
      : node)
    return Promise.all([
      expect(run(decodeInput(), makeCatalog({ nodes: nodes.slice(0, -1) }))).rejects.toMatchObject({ reason: "unpublished-node", nodeId: ids.subjectId }),
      expect(run(decodeInput(), makeCatalog({ nodes: manipulated }))).rejects.toMatchObject({ reason: "unexpected-node-kind", nodeId: ids.subjectId }),
    ])
  })
})
