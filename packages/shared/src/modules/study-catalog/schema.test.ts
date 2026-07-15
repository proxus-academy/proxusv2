import { describe, expect, expectTypeOf, it } from "vitest"
import { Schema } from "effect"
import {
  CountryTypeEdge,
  DegreeNode,
  DegreeSubjectEdge,
  StudyEdge,
  StudyNode,
  SubjectNode,
  UniversityNode,
  UniversitySubjectEdge,
  makeCountryNodeId,
  makeDegreeNodeId,
  makeStudyAssetId,
  makeStudyEdgeId,
  makeStudyTypeNodeId,
  makeSubjectNodeId,
  makeUniversityNodeId,
  type CountryNodeId,
  type DegreeNodeId,
  type StudyAssetId,
  type StudyNodeSourcesOfId,
  type StudyNodeTargetsOfId,
  type SubjectNodeId,
  type UniversityNodeId,
} from "./schema.js"

const countryIdValue = "00000000-0000-4000-8000-000000000001"
const studyTypeIdValue = "00000000-0000-4000-8000-000000000002"
const universityIdValue = "00000000-0000-4000-8000-000000000003"
const degreeIdValue = "00000000-0000-4000-8000-000000000004"
const edgeIdValue = "00000000-0000-4000-8000-000000000005"
const subjectIdValue = "00000000-0000-4000-8000-000000000006"
const assetIdValue = "00000000-0000-4000-8000-000000000008"
const timestampValue = "2026-07-14T12:00:00.000Z"

const countryId = makeCountryNodeId(countryIdValue)
const studyTypeId = makeStudyTypeNodeId(studyTypeIdValue)
const universityId = makeUniversityNodeId(universityIdValue)
const degreeId = makeDegreeNodeId(degreeIdValue)
const edgeId = makeStudyEdgeId(edgeIdValue)
const subjectId = makeSubjectNodeId(subjectIdValue)
const assetId = makeStudyAssetId(assetIdValue)
const timestamp = Schema.decodeUnknownSync(Schema.DateTimeUtcFromString)(
  timestampValue,
)

describe("StudyNode", () => {
  it("decodes the discriminated variant and brands its id", () => {
    const node = Schema.decodeUnknownSync(StudyNode)({
      id: universityIdValue,
      kind: "university",
      name: "Universidad Complutense",
      imageAssetId: assetIdValue,
      status: "published",
      createdAt: timestampValue,
      updatedAt: timestampValue,
    })

    expect(node).toBeInstanceOf(UniversityNode)
    expect(node.kind).toBe("university")
    expect(node.imageAssetId).toBe(assetId)

    if (node.kind === "university") {
      expectTypeOf(node.id).toEqualTypeOf<UniversityNodeId>()
      expectTypeOf(node.imageAssetId).toEqualTypeOf<StudyAssetId | null>()
    }
  })

  it("rejects unknown node kinds", () => {
    expect(() =>
      Schema.decodeUnknownSync(StudyNode)({
        id: universityIdValue,
        kind: "unknown",
        name: "Unknown",
        imageAssetId: null,
        status: "published",
        createdAt: timestampValue,
        updatedAt: timestampValue,
      }),
    ).toThrow()
  })

  it("constructs a node only with its corresponding branded id", () => {
    const degree = new DegreeNode({
      id: degreeId,
      kind: "degree",
      name: "Ingeniería Informática",
      imageAssetId: null,
      status: "published",
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    expect(degree.id).toBe(degreeIdValue)

    if (false) {
      new DegreeNode({
        // @ts-expect-error University ids cannot initialize degree nodes.
        id: universityId,
        kind: "degree",
        name: "Invalid",
        imageAssetId: null,
        status: "published",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }
  })
})

describe("StudyEdge", () => {
  it("constructs a typed edge between the allowed id brands", () => {
    const edge = new CountryTypeEdge({
      id: edgeId,
      from: countryId,
      to: studyTypeId,
      position: 0,
    })

    expect(edge._tag).toBe("CountryTypeEdge")
    expectTypeOf(edge.from).toEqualTypeOf<CountryNodeId>()
  })

  it("decodes concrete edges through the union", () => {
    const edge = Schema.decodeUnknownSync(StudyEdge)({
      _tag: "CountryTypeEdge",
      id: edgeIdValue,
      from: countryIdValue,
      to: studyTypeIdValue,
      position: 0,
    })

    expect(edge).toBeInstanceOf(CountryTypeEdge)
    expect(edge._tag).toBe("CountryTypeEdge")
  })

  it("derives university and degree paths to a shared subject", () => {
    const universitySubject = new UniversitySubjectEdge({
      id: edgeId,
      from: universityId,
      to: subjectId,
      position: 0,
    })
    const degreeSubject = new DegreeSubjectEdge({
      id: makeStudyEdgeId("00000000-0000-4000-8000-000000000007"),
      from: degreeId,
      to: subjectId,
      position: 0,
    })

    expect(universitySubject.to).toBe(subjectIdValue)
    expect(degreeSubject.to).toBe(subjectIdValue)
    expectTypeOf<StudyNodeTargetsOfId<UniversityNodeId>>().toEqualTypeOf<
      DegreeNode | SubjectNode
    >()
    expectTypeOf<StudyNodeSourcesOfId<SubjectNodeId>>().toEqualTypeOf<
      UniversityNode | DegreeNode
    >()
    expectTypeOf(degreeSubject.from).toEqualTypeOf<DegreeNodeId>()
  })

  it("rejects edge variants outside the union", () => {
    expect(() =>
      Schema.decodeUnknownSync(StudyEdge)({
        _tag: "CountryDegreeEdge",
        id: edgeIdValue,
        from: countryIdValue,
        to: degreeIdValue,
        position: 0,
      }),
    ).toThrow()
  })
})
