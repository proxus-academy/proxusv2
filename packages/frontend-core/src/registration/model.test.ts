import {
  CountryNode,
  DegreeNode,
  StudyTypeNode,
  SubjectNode,
  UniversityNode,
  makeCountryNodeId,
  makeDegreeNodeId,
  makeStudyTypeNodeId,
  makeSubjectNodeId,
  makeUniversityNodeId,
} from "@proxus/shared/study-catalog"
import { DateTime, Option, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { RegistrationPathParam } from "./model.js"

const now = DateTime.makeUnsafe(0)
const common = {
  imageAssetId: null,
  status: "published" as const,
  createdAt: now,
  updatedAt: now,
}
const country = new CountryNode({ ...common, id: makeCountryNodeId("20000000-0000-4000-8000-000000000001"), kind: "country", name: "España" })
const studyType = new StudyTypeNode({ ...common, id: makeStudyTypeNodeId("20000000-0000-4000-8000-000000000002"), kind: "type", name: "Universidad" })
const university = new UniversityNode({ ...common, id: makeUniversityNodeId("20000000-0000-4000-8000-000000000003"), kind: "university", name: "UCM" })
const degree = new DegreeNode({ ...common, id: makeDegreeNodeId("20000000-0000-4000-8000-000000000004"), kind: "degree", name: "Informática" })
const subject = new SubjectNode({ ...common, id: makeSubjectNodeId("20000000-0000-4000-8000-000000000005"), kind: "subject", name: "Álgebra" })
const uncheckedPathParam = Schema.fromJsonString(Schema.Array(Schema.String))
const encodeUnchecked = Schema.encodeSync(uncheckedPathParam)
const decodePath = Schema.decodeUnknownOption(RegistrationPathParam)

const validPaths = [
  [],
  [country.id],
  [country.id, studyType.id, university.id, degree.id, subject.id],
  [country.id, university.id, subject.id],
  [subject.id],
] as const

describe("RegistrationPathParam", () => {
  it.each(validPaths.map((path, index) => [index, path] as const))(
    "accepts published graph prefix %s",
    (_index, path) => {
      const decoded = decodePath(encodeUnchecked(path))
      expect(Option.isSome(decoded)).toBe(true)
      if (Option.isSome(decoded)) {
        expect(decoded.value).toEqual(path)
      }
    },
  )

  it.each([
    ["non UUID", ["draft-node"]],
  ] as const)("rejects %s", (_name, path) => {
    expect(Option.isNone(decodePath(encodeUnchecked(path)))).toBe(true)
  })
})
