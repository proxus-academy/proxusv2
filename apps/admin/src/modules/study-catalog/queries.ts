import type { StudyEdge, StudyNode, StudyNodeId, StudyNodeKind, StudyNodeStatus } from "@proxus/shared/study-catalog"
import { Effect } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { AdminStudyCatalogClient } from "./api.js"
import { studyCatalogRuntime } from "./runtime.js"

export type NodeKindFilter = StudyNodeKind
export type NodeStatusFilter = StudyNodeStatus
export type NodeFilterKey = `${NodeKindFilter}:${NodeStatusFilter}`

export const nodesFamily = Atom.family((key: NodeFilterKey) =>
  studyCatalogRuntime.atom(
    Effect.gen(function*() {
      const catalog = yield* AdminStudyCatalogClient
      const [kind, status] = key.split(":") as [NodeKindFilter, NodeStatusFilter]
      return yield* catalog.listNodes({ query: { kind, status } })
    }),
  ),
)

export const nodeFamily = Atom.family((nodeId: StudyNodeId) =>
  studyCatalogRuntime.atom(
    Effect.gen(function*() {
      const catalog = yield* AdminStudyCatalogClient
      return yield* catalog.getNode({ params: { nodeId } })
    }),
  ),
)

export interface NodeRelation {
  readonly edge: StudyEdge
  readonly node: StudyNode
}

const pairRelations = (
  edges: ReadonlyArray<StudyEdge>,
  nodes: ReadonlyArray<StudyNode>,
  endpoint: "from" | "to",
): ReadonlyArray<NodeRelation> => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  return edges.flatMap((edge) => {
    const node = nodesById.get(edge[endpoint])
    return node === undefined ? [] : [{ edge, node }]
  })
}

export const outgoingRelationsFamily = Atom.family((nodeId: StudyNodeId) =>
  studyCatalogRuntime.atom(
    Effect.gen(function*() {
      const catalog = yield* AdminStudyCatalogClient
      const [edges, nodes] = yield* Effect.all([
        catalog.listOutgoingEdges({ params: { nodeId } }),
        catalog.listTargets({ params: { nodeId } }),
      ], { concurrency: "unbounded" })
      return pairRelations(edges, nodes, "to")
    }),
  ),
)

export const incomingRelationsFamily = Atom.family((nodeId: StudyNodeId) =>
  studyCatalogRuntime.atom(
    Effect.gen(function*() {
      const catalog = yield* AdminStudyCatalogClient
      const [edges, nodes] = yield* Effect.all([
        catalog.listIncomingEdges({ params: { nodeId } }),
        catalog.listSources({ params: { nodeId } }),
      ], { concurrency: "unbounded" })
      return pairRelations(edges, nodes, "from")
    }),
  ),
)
