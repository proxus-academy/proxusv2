import { StudyCatalog, StudyCatalogRepositoryError } from "@proxus/backend-domain/study-catalog"
import { PublicApi } from "@proxus/shared/public-api"
import {
  CountryNode,
  DegreeNode,
  StudyTypeNode,
  SubjectNode,
  UniversityNode,
  type StudyNode,
} from "@proxus/shared/study-catalog"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"

const mapRepositoryError = <A, E, R>(
  effect: Effect.Effect<A, E | StudyCatalogRepositoryError, R>,
) => effect.pipe(
  Effect.catchTag("StudyCatalogRepositoryError", () =>
    Effect.fail(new HttpApiError.InternalServerError({})),
  ),
)

export const PublicStudyCatalogHandlers = HttpApiBuilder.group(
  PublicApi,
  "publicStudyCatalog",
  Effect.fn(function* (handlers) {
    const catalog = yield* StudyCatalog
    function withUserCount(node: CountryNode, userCount: number): CountryNode
    function withUserCount(node: StudyTypeNode, userCount: number): StudyTypeNode
    function withUserCount(node: UniversityNode, userCount: number): UniversityNode
    function withUserCount(node: DegreeNode, userCount: number): DegreeNode
    function withUserCount(node: SubjectNode, userCount: number): SubjectNode
    function withUserCount(node: StudyNode, userCount: number): StudyNode
    function withUserCount(node: StudyNode, userCount: number): StudyNode {
      switch (node.kind) {
        case "country": return new CountryNode({ ...node, userCount })
        case "type": return new StudyTypeNode({ ...node, userCount })
        case "university": return new UniversityNode({ ...node, userCount })
        case "degree": return new DegreeNode({ ...node, userCount })
        case "subject": return new SubjectNode({ ...node, userCount })
      }
    }
    const includeMetrics = (
      nodes: ReadonlyArray<StudyNode>,
    ): Effect.Effect<ReadonlyArray<StudyNode>, StudyCatalogRepositoryError> =>
      Effect.gen(function*() {
        if (catalog.userCountsByNodeIds === undefined) return nodes
        const counts = yield* catalog.userCountsByNodeIds(nodes.map(({ id }) => id))
        return nodes.map((node) => withUserCount(node, counts.get(node.id) ?? 0))
      })
    const includeCountryMetrics = (
      nodes: ReadonlyArray<CountryNode>,
    ): Effect.Effect<ReadonlyArray<CountryNode>, StudyCatalogRepositoryError> =>
      Effect.gen(function*() {
        if (catalog.userCountsByNodeIds === undefined) return nodes
        const counts = yield* catalog.userCountsByNodeIds(nodes.map(({ id }) => id))
        return nodes.map((node) => new CountryNode({
          ...node,
          userCount: counts.get(node.id) ?? 0,
        }))
      })
    const includeMetric = (
      node: StudyNode,
    ): Effect.Effect<StudyNode, StudyCatalogRepositoryError> =>
      includeMetrics([node]).pipe(Effect.map((nodes) => nodes[0] ?? node))

    return handlers
      .handle("listCountries", () => mapRepositoryError(catalog.listCountries().pipe(Effect.flatMap(includeCountryMetrics))))
      .handle("listRoots", () => mapRepositoryError(catalog.listRoots().pipe(Effect.flatMap(includeCountryMetrics))))
      .handle("listChildren", ({ params }) => mapRepositoryError(catalog.listChildren(params.nodeId).pipe(Effect.flatMap(includeMetrics))))
      .handle("getNode", ({ params }) => mapRepositoryError(catalog.getPublishedNode(params.nodeId).pipe(Effect.flatMap(includeMetric))))
      .handle("getEdge", ({ params }) => mapRepositoryError(catalog.getPublishedEdge(params.edgeId)))
      .handle("listOutgoingEdges", ({ params }) => mapRepositoryError(catalog.listPublishedOutgoingEdges(params.nodeId)))
      .handle("listIncomingEdges", ({ params }) => mapRepositoryError(catalog.listPublishedIncomingEdges(params.nodeId)))
      .handle("listTargets", ({ params }) => mapRepositoryError(catalog.listPublishedTargets(params.nodeId).pipe(Effect.flatMap(includeMetrics))))
      .handle("listSources", ({ params }) => mapRepositoryError(catalog.listPublishedSources(params.nodeId).pipe(Effect.flatMap(includeMetrics))))
  }),
)
