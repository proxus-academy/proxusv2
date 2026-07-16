import { describe, expect, it } from "vitest"
import { childRelationshipsFor } from "./model.js"

describe("childRelationshipsFor", () => {
  it.each([
    ["country", ["CountryTypeEdge"]],
    ["type", ["TypeUniversityEdge"]],
    ["university", ["UniversityDegreeEdge", "UniversitySubjectEdge"]],
    ["degree", ["DegreeSubjectEdge"]],
    ["subject", []],
  ] as const)("maps %s exhaustively", (kind, expected) => {
    expect(childRelationshipsFor(kind)).toEqual(expected)
  })
})
