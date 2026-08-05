import {
  CreateStudyNodePayload,
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

export const createNodeMutation = studyCatalogRuntime.fn(
  Effect.fnUntraced(function*(input: { readonly kind: StudyNodeKind; readonly name: string }, get) {
    const tags = {
      country: "CreateCountry",
      type: "CreateStudyType",
      university: "CreateUniversity",
      degree: "CreateDegree",
      subject: "CreateSubject",
    } as const
    const payload = yield* Schema.decodeUnknownEffect(CreateStudyNodePayload)({
      _tag: tags[input.kind],
      name: input.name.trim(),
    })
    const catalog = yield* AdminStudyCatalogClient
    const node = yield* (() => {
      switch (payload._tag) {
        case "CreateCountry": return catalog.createNode({ payload })
        case "CreateStudyType": return catalog.createNode({ payload })
        case "CreateUniversity": return catalog.createNode({ payload })
        case "CreateDegree": return catalog.createNode({ payload })
        case "CreateSubject": return catalog.createNode({ payload })
      }
    })()
    get.refresh(nodesFamily(`${node.kind}:${node.status}`))
    return node
  }),
)

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

export interface ConnectNodesInput { readonly edge: unknown }
export const connectNodesMutationFamily = Atom.family((nodeId: StudyNodeId) =>
  studyCatalogRuntime.fn(
    Effect.fnUntraced(function*(input: ConnectNodesInput, get) {
      const payload = yield* Schema.decodeUnknownEffect(CreateStudyEdgePayload)(input.edge)
      const catalog = yield* AdminStudyCatalogClient
      let edge: StudyEdge
      switch (payload._tag) {
        case "CountryTypeEdge":
          edge = yield* catalog.connect({ payload })
          break
        case "TypeUniversityEdge":
          edge = yield* catalog.connect({ payload })
          break
        case "UniversityDegreeEdge":
          edge = yield* catalog.connect({ payload })
          break
        case "UniversitySubjectEdge":
          edge = yield* catalog.connect({ payload })
          break
        case "DegreeSubjectEdge":
          edge = yield* catalog.connect({ payload })
          break
      }
      get.refresh(outgoingRelationsFamily(edge.from))
      get.refresh(incomingRelationsFamily(edge.to))
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
      get.refresh(outgoingRelationsFamily(input.previousFrom))
      get.refresh(incomingRelationsFamily(input.previousTo))
      get.refresh(outgoingRelationsFamily(edge.from))
      get.refresh(incomingRelationsFamily(edge.to))
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
      get.refresh(outgoingRelationsFamily(input.from))
      get.refresh(incomingRelationsFamily(input.to))
    }),
  ),
)
