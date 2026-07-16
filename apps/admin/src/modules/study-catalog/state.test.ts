import { CountryNode, makeCountryNodeId } from "@proxus/shared/study-catalog"
import { DateTime } from "effect"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it } from "vitest"
import { incomingEdgeTags, nodeKindFilterAtom, nodeStatusFilterAtom, outgoingEdgeTags, renameValueFamily, selectedNodeIdAtom, selectNodeAtom } from "./state.js"

const makeCountry = (suffix: string, name: string) => new CountryNode({
  id: makeCountryNodeId(`20000000-0000-4000-8000-${suffix}`),
  kind: "country",
  name,
  imageAssetId: null,
  status: "published",
  createdAt: DateTime.makeUnsafe(0),
  updatedAt: DateTime.makeUnsafe(0),
})

const spain = makeCountry("000000000001", "España")
const portugal = makeCountry("000000000002", "Portugal")

describe("study catalog admin state", () => {
  it("derives compatible relationship tags from node kinds", () => {
    expect(outgoingEdgeTags("university")).toEqual(["UniversityDegreeEdge", "UniversitySubjectEdge"])
    expect(incomingEdgeTags("subject")).toEqual(["UniversitySubjectEdge", "DegreeSubjectEdge"])
    expect(outgoingEdgeTags("subject")).toEqual([])
  })

  it("defaults to a bounded published-country query and keeps filters in atoms", () => {
    const registry = AtomRegistry.make()

    expect(registry.get(nodeKindFilterAtom)).toBe("country")
    expect(registry.get(nodeStatusFilterAtom)).toBe("published")

    registry.set(nodeKindFilterAtom, "university")
    registry.set(nodeStatusFilterAtom, "draft")

    expect(registry.get(nodeKindFilterAtom)).toBe("university")
    expect(registry.get(nodeStatusFilterAtom)).toBe("draft")
  })

  it("selects a node and initializes its rename form", () => {
    const registry = AtomRegistry.make()

    registry.set(selectNodeAtom, spain)

    expect(registry.get(selectedNodeIdAtom)).toBe(spain.id)
    expect(registry.get(renameValueFamily(spain.id))).toBe("España")
  })

  it("keeps editor state isolated by node id", () => {
    const registry = AtomRegistry.make()

    registry.set(selectNodeAtom, spain)
    registry.set(renameValueFamily(spain.id), "España editada")
    registry.set(selectNodeAtom, portugal)

    expect(registry.get(renameValueFamily(spain.id))).toBe("España editada")
    expect(registry.get(renameValueFamily(portugal.id))).toBe("Portugal")
  })
})
