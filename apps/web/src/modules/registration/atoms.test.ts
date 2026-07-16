import {
  CountryNode,
  StudyTypeNode,
  makeCountryNodeId,
  makeStudyTypeNodeId,
} from "@proxus/shared/study-catalog"
import { DateTime } from "effect"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import {
  goBackRegistrationAtom,
  registrationPathAtom,
  resetRegistrationAtom,
  selectRegistrationNodeAtom,
} from "./atoms.js"

const now = DateTime.makeUnsafe(0)
const country = new CountryNode({
  id: makeCountryNodeId("20000000-0000-4000-8000-000000000001"),
  kind: "country",
  name: "España",
  imageAssetId: null,
  status: "published",
  createdAt: now,
  updatedAt: now,
})
const studyType = new StudyTypeNode({
  id: makeStudyTypeNodeId("20000000-0000-4000-8000-000000000002"),
  kind: "type",
  name: "Estudios universitarios",
  imageAssetId: null,
  status: "published",
  createdAt: now,
  updatedAt: now,
})

describe("registration graph path", () => {
  it("selects valid consecutive nodes and supports back and reset", () => {
    const registry = AtomRegistry.make()

    registry.set(selectRegistrationNodeAtom, country)
    registry.set(selectRegistrationNodeAtom, studyType)
    expect(registry.get(registrationPathAtom)).toEqual([country, studyType])

    registry.set(goBackRegistrationAtom, undefined)
    expect(registry.get(registrationPathAtom)).toEqual([country])

    registry.set(resetRegistrationAtom, undefined)
    expect(registry.get(registrationPathAtom)).toEqual([])
  })

  it("rejects nodes that do not match the current level", () => {
    const registry = AtomRegistry.make()

    registry.set(selectRegistrationNodeAtom, studyType)

    expect(registry.get(registrationPathAtom)).toEqual([])
  })
})
