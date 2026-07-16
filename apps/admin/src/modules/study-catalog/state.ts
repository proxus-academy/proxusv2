import type { StudyEdge, StudyNode, StudyNodeId } from "@proxus/shared/study-catalog"
import type { NodeKindFilter, NodeStatusFilter } from "./queries.js"
import * as Atom from "effect/unstable/reactivity/Atom"

export const selectedNodeIdAtom = Atom.make<StudyNodeId | null>(null)
export const nodeKindFilterAtom = Atom.make<NodeKindFilter>("country")
export const nodeStatusFilterAtom = Atom.make<NodeStatusFilter>("published")
export type RelationTagFilter = StudyEdge["_tag"] | "all"
export const incomingTagFilterFamily = Atom.family((_nodeId: StudyNodeId) => Atom.make<RelationTagFilter>("all"))
export const outgoingTagFilterFamily = Atom.family((_nodeId: StudyNodeId) => Atom.make<RelationTagFilter>("all"))
export const renameValueFamily = Atom.family((_nodeId: StudyNodeId) => Atom.make(""))

export const edgeKinds = {
  CountryTypeEdge: { from: "country", to: "type" },
  TypeUniversityEdge: { from: "type", to: "university" },
  UniversityDegreeEdge: { from: "university", to: "degree" },
  UniversitySubjectEdge: { from: "university", to: "subject" },
  DegreeSubjectEdge: { from: "degree", to: "subject" },
} as const satisfies Record<StudyEdge["_tag"], { readonly from: StudyNode["kind"]; readonly to: StudyNode["kind"] }>

export const outgoingEdgeTags = (kind: StudyNode["kind"]): ReadonlyArray<StudyEdge["_tag"]> =>
  (Object.keys(edgeKinds) as Array<StudyEdge["_tag"]>).filter((tag) => edgeKinds[tag].from === kind)

export const incomingEdgeTags = (kind: StudyNode["kind"]): ReadonlyArray<StudyEdge["_tag"]> =>
  (Object.keys(edgeKinds) as Array<StudyEdge["_tag"]>).filter((tag) => edgeKinds[tag].to === kind)

export const selectNodeAtom = Atom.fnSync<StudyNode>()((node, get) => {
  get.set(selectedNodeIdAtom, node.id)
  get.set(renameValueFamily(node.id), node.name)
})
