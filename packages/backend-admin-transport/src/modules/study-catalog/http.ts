import { StudyCatalog, StudyCatalogRepositoryError } from "@proxus/backend-domain/study-catalog"
import { AdminApi } from "@proxus/shared/admin-api"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"

const mapRepositoryError = <A, E, R>(
  effect: Effect.Effect<A, E | StudyCatalogRepositoryError, R>,
) => effect.pipe(
  Effect.catchTag("StudyCatalogRepositoryError", () =>
    Effect.fail(new HttpApiError.InternalServerError({})),
  ),
)

/**
 * Administrative handlers are deliberately unauthenticated during development.
 * This transport must not be exposed publicly until an administrative identity
 * layer is introduced at this boundary.
 */
export const AdminStudyCatalogHandlers = HttpApiBuilder.group(
  AdminApi,
  "adminStudyCatalog",
  Effect.fn(function* (handlers) {
    const catalog = yield* StudyCatalog

    return handlers
      .handle("listNodes", ({ query }) => mapRepositoryError(catalog.listNodes(query)))
      .handle("getNode", ({ params }) => mapRepositoryError(catalog.getNode(params.nodeId)))
      .handle("listOutgoingEdges", ({ params }) => mapRepositoryError(catalog.listOutgoingEdges(params.nodeId)))
      .handle("listIncomingEdges", ({ params }) => mapRepositoryError(catalog.listIncomingEdges(params.nodeId)))
      .handle("listTargets", ({ params }) => mapRepositoryError(catalog.listTargets(params.nodeId)))
      .handle("listSources", ({ params }) => mapRepositoryError(catalog.listSources(params.nodeId)))
      .handle("createNode", ({ payload }) => mapRepositoryError(catalog.createNode(payload)))
      .handle("renameNode", ({ params, payload }) => mapRepositoryError(catalog.renameNode(params.nodeId, payload.name)))
      .handle("updateNodeStatus", ({ params, payload }) => mapRepositoryError(catalog.updateNodeStatus(params.nodeId, payload)))
      .handle("connect", ({ payload }) => mapRepositoryError(catalog.connect(payload)))
      .handle("updateEdge", ({ params, payload }) => mapRepositoryError(catalog.updateEdge(params.edgeId, payload)))
      .handle("disconnect", ({ params }) => mapRepositoryError(catalog.disconnect(params.edgeId)))
  }),
)
