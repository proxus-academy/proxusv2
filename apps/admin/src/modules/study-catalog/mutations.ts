import {
  CreateStudyEdgePayload,
  RenameStudyNodePayload,
  UpdateStudyEdgePayload,
  type StudyEdge,
  type StudyEdgeId,
  type StudyNodeId,
  type StudyNodeKind,
  type StudyNodeStatus,
} from "@proxus/shared/study-catalog"
import { Effect, Schema } from "effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { AdminStudyCatalogClient } from "./api.js"
import { incomingRelationsFamily, nodeFamily, nodesFamily, outgoingRelationsFamily, type NodeFilterKey } from "./queries.js"
import { studyCatalogRuntime } from "./runtime.js"
import { renameValueFamily } from "./state.js"

export interface RenameNodeInput { readonly name: string; readonly filterKey: NodeFilterKey }

export const renameNodeMutationFamily = Atom.family((nodeId: StudyNodeId) =>
  studyCatalogRuntime.fn(
    Effect.fnUntraced(function*(input: RenameNodeInput, get) {
      const payload = yield* Schema.decodeUnknownEffect(RenameStudyNodePayload)({ name: input.name.trim() })
      const catalog = yield* AdminStudyCatalogClient
      const node = yield* catalog.renameNode({ params: { nodeId }, payload })
      get.set(renameValueFamily(nodeId), node.name)
      get.refresh(nodeFamily(nodeId)); get.refresh(nodesFamily(input.filterKey))
      return node
    }),
  ),
)

export interface UpdateNodeStatusInput {
  readonly kind: StudyNodeKind
  readonly previousStatus: StudyNodeStatus
  readonly status: StudyNodeStatus
}

export const updateNodeStatusMutationFamily = Atom.family((nodeId: StudyNodeId) =>
  studyCatalogRuntime.fn(
    Effect.fnUntraced(function*(input: UpdateNodeStatusInput, get) {
      const catalog = yield* AdminStudyCatalogClient
      const node = yield* catalog.updateNodeStatus({ params: { nodeId }, payload: input.status })
      get.refresh(nodeFamily(nodeId))
      get.refresh(nodesFamily(`${input.kind}:${input.previousStatus}`))
      get.refresh(nodesFamily(`${input.kind}:${input.status}`))
      return node
    }),
  ),
)

const refreshRelations = (get: { refresh: (atom: any) => void }, from: StudyNodeId, to: StudyNodeId) => {
  get.refresh(outgoingRelationsFamily(from)); get.refresh(incomingRelationsFamily(to))
}

export interface ConnectNodesInput { readonly edge: unknown }
export const connectNodesMutationFamily = Atom.family((nodeId: StudyNodeId) =>
  studyCatalogRuntime.fn(
    Effect.fnUntraced(function*(input: ConnectNodesInput, get) {
      const payload = yield* Schema.decodeUnknownEffect(CreateStudyEdgePayload)(input.edge)
      const catalog = yield* AdminStudyCatalogClient
      const edge = yield* catalog.connect({ payload: payload as never })
      refreshRelations(get, edge.from, edge.to)
      return edge
    }),
  ),
)

export interface UpdateEdgeInput {
  readonly previousFrom: StudyNodeId
  readonly previousTo: StudyNodeId
  readonly from: StudyNodeId
  readonly to: StudyNodeId
  readonly position: number
}
export const updateEdgeMutationFamily = Atom.family((edgeId: StudyEdgeId) =>
  studyCatalogRuntime.fn(
    Effect.fnUntraced(function*(input: UpdateEdgeInput, get) {
      const payload = yield* Schema.decodeUnknownEffect(UpdateStudyEdgePayload)({ from: input.from, to: input.to, position: input.position })
      const catalog = yield* AdminStudyCatalogClient
      const edge = yield* catalog.updateEdge({ params: { edgeId }, payload })
      refreshRelations(get, input.previousFrom, input.previousTo)
      refreshRelations(get, edge.from, edge.to)
      return edge
    }),
  ),
)

export interface DisconnectEdgeInput { readonly from: StudyNodeId; readonly to: StudyNodeId }
export const disconnectEdgeMutationFamily = Atom.family((edgeId: StudyEdgeId) =>
  studyCatalogRuntime.fn(
    Effect.fnUntraced(function*(input: DisconnectEdgeInput, get) {
      const catalog = yield* AdminStudyCatalogClient
      yield* catalog.disconnect({ params: { edgeId } })
      refreshRelations(get, input.from, input.to)
    }),
  ),
)
