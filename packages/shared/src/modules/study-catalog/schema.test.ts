import { describe, expect, expectTypeOf, it } from "vitest"
import { Schema } from "effect"
import {
  CountryTypeEdge,
  DegreeNode,
  StudyEdge,
  StudyNode,
  UniversitiesNode,
  makeCountryNodeId,
  makeDegreeNodeId,
  makeStudyEdgeId,
  makeStudyTypeNodeId,
  makeUniversitiesNodeId,
  type CountryNodeId,
  type UniversitiesNodeId,
} from "./schema.js"

const countryIdValue = "00000000-0000-4000-8000-000000000001"
const studyTypeIdValue = "00000000-0000-4000-8000-000000000002"
const universityIdValue = "00000000-0000-4000-8000-000000000003"
const degreeIdValue = "00000000-0000-4000-8000-000000000004"
const edgeIdValue = "00000000-0000-4000-8000-000000000005"
const timestampValue = "2026-07-14T12:00:00.000Z"

const countryId = makeCountryNodeId(countryIdValue)
const studyTypeId = makeStudyTypeNodeId(studyTypeIdValue)
const universityId = makeUniversitiesNodeId(universityIdValue)
const degreeId = makeDegreeNodeId(degreeIdValue)
const edgeId = makeStudyEdgeId(edgeIdValue)
const timestamp = Schema.decodeUnknownSync(Schema.DateTimeUtcFromString)(
  timestampValue,
)

describe("StudyNode", () => {
  it("decodes the discriminated variant and brands its id", () => {
    const node = Schema.decodeUnknownSync(StudyNode)({
      id: universityIdValue,
      kind: "universities",
      name: "Universidad Complutense",
      status: "published",
      createdAt: timestampValue,
      updatedAt: timestampValue,
    })

    expect(node).toBeInstanceOf(UniversitiesNode)
    expect(node.kind).toBe("universities")

    if (node.kind === "universities") {
      expectTypeOf(node.id).toEqualTypeOf<UniversitiesNodeId>()
    }
  })

  it("rejects unknown node kinds", () => {
    expect(() =>
      Schema.decodeUnknownSync(StudyNode)({
        id: universityIdValue,
        kind: "unknown",
        name: "Unknown",
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
