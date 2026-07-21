// @vitest-environment happy-dom
import {
  CountryNode,
  StudyTypeNode,
  makeCountryNodeId,
  makeStudyTypeNodeId,
} from "@proxus/shared/study-catalog"
import { DateTime } from "effect"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

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

beforeAll(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(
    "{\"configurationRevision\":0,\"flags\":[]}",
    { status: 200, headers: { "content-type": "application/json" } },
  ))))
})

afterAll(() => vi.unstubAllGlobals())

const loadAtoms = () => import("./atoms.js")

describe("registration graph path", () => {
  it("selects valid consecutive nodes and supports back and reset", () => loadAtoms().then(({
    goBackRegistrationAtom,
    registrationPathAtom,
    resetRegistrationAtom,
    selectRegistrationNodeAtom,
  }) => {
    const registry = AtomRegistry.make()

    registry.set(selectRegistrationNodeAtom, country)
    registry.set(selectRegistrationNodeAtom, studyType)
    expect(registry.get(registrationPathAtom)).toEqual([country, studyType])

    registry.set(goBackRegistrationAtom, undefined)
    expect(registry.get(registrationPathAtom)).toEqual([country])

    registry.set(resetRegistrationAtom, undefined)
    expect(registry.get(registrationPathAtom)).toEqual([])
  }))

  it("rejects nodes that do not match the current level", () => loadAtoms().then(({
    registrationPathAtom,
    selectRegistrationNodeAtom,
  }) => {
    const registry = AtomRegistry.make()

    registry.set(selectRegistrationNodeAtom, studyType)

    expect(registry.get(registrationPathAtom)).toEqual([])
  }))
})
