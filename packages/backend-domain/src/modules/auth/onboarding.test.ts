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
  study: ids,
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
  readonly breakBefore?: StudyNodeId
  readonly terminalChild?: boolean
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
    listPublishedIncomingEdges: unavailable, listPublishedSources: unavailable,
    getPublishedNode: (id) => {
      const node = available.find((candidate) => candidate.id === id)
      return node === undefined
        ? Effect.fail(new StudyNodeNotFound({ nodeId: id }))
        : Effect.succeed(node)
    },
    listPublishedTargets: (sourceId) => {
      if (sourceId === ids.subjectId) return Effect.succeed(options.terminalChild === true ? [terminalChild] : [])
      const index = nodes.findIndex(({ id }) => id === sourceId)
      const target = nodes[index + 1]
      return Effect.succeed(target === undefined || target.id === options.breakBefore ? [] : [target])
    },
  })
}

describe("onboarding domain validation", () => {
  test.each([1900, 2016])("accepts birth-year boundary %i", (birthYear) =>
    expect(run(decodeInput({ birthYear }))).resolves.toMatchObject({ birthYear }),
  )

  test.each([1899, 2017])("rejects birth year outside the supported range: %i", (birthYear) =>
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

  test("normalizes username", () =>
    expect(run(decodeInput())).resolves.toMatchObject({ normalizedUsername: "learner_1" }),
  )

  test("accepts a published contiguous path ending at a terminal subject and stores IDs only", () =>
    run(decodeInput()).then((draft) => {
      expect(draft.study.nodeIds).toEqual(Object.values(ids))
      expect(JSON.stringify(draft)).not.toContain("must-not-be-persisted")
      expect(Object.keys(draft.study)).not.toContain("name")
    }),
  )

  test("rejects non-contiguous and non-terminal paths", () => Promise.all([
    expect(run(decodeInput(), makeCatalog({ breakBefore: ids.degreeId }))).rejects.toMatchObject({ _tag: "InvalidStudyPath", reason: "non-contiguous", nodeId: ids.degreeId }),
    expect(run(decodeInput(), makeCatalog({ terminalChild: true }))).rejects.toMatchObject({ reason: "non-terminal" }),
  ]))

  test("rejects unpublished and client-manipulated node kinds", () => {
    const manipulated = [...nodes]
    manipulated[2] = new DegreeNode({ ...fields, id: makeDegreeNodeId(ids.universityId), kind: "degree" })
    return Promise.all([
      expect(run(decodeInput(), makeCatalog({ nodes: nodes.slice(0, -1) }))).rejects.toMatchObject({ reason: "unpublished-node", nodeId: ids.subjectId }),
      expect(run(decodeInput(), makeCatalog({ nodes: manipulated }))).rejects.toMatchObject({ reason: "unexpected-node-kind", nodeId: ids.universityId }),
    ])
  })
})
