import { ProxusApi } from "@proxus/shared/api"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { StudyCatalogRepositoryError } from "./repository.js"
import { StudyCatalog } from "./service.js"

const mapRepositoryError = <A, E, R>(
  effect: Effect.Effect<A, E | StudyCatalogRepositoryError, R>,
) =>
  effect.pipe(
    Effect.catchTag("StudyCatalogRepositoryError", () =>
      Effect.fail(new HttpApiError.InternalServerError({})),
    ),
  )

export const PublicStudyCatalogHandlers = HttpApiBuilder.group(
  ProxusApi,
  "publicStudyCatalog",
  Effect.fn(function* (handlers) {
    const catalog = yield* StudyCatalog

    return handlers
      .handle("getNode", ({ params }) =>
        mapRepositoryError(catalog.getNode(params.nodeId)),
      )
      .handle("getEdge", ({ params }) =>
        mapRepositoryError(catalog.getEdge(params.edgeId)),
      )
      .handle("listOutgoingEdges", ({ params }) =>
        mapRepositoryError(catalog.listOutgoingEdges(params.nodeId)),
      )
      .handle("listIncomingEdges", ({ params }) =>
        mapRepositoryError(catalog.listIncomingEdges(params.nodeId)),
      )
      .handle("listTargets", ({ params }) =>
        mapRepositoryError(catalog.listTargets(params.nodeId)),
      )
      .handle("listSources", ({ params }) =>
        mapRepositoryError(catalog.listSources(params.nodeId)),
      )
  }),
)

export const AdminStudyCatalogHandlers = HttpApiBuilder.group(
  ProxusApi,
  "adminStudyCatalog",
  Effect.fn(function* (handlers) {
    const catalog = yield* StudyCatalog

    return handlers
      .handle("createNode", ({ payload }) =>
        mapRepositoryError(catalog.createNode(payload)),
      )
      .handle("renameNode", ({ params, payload }) =>
        mapRepositoryError(catalog.renameNode(params.nodeId, payload.name)),
      )
      .handle("archiveNode", ({ params }) =>
        mapRepositoryError(catalog.archiveNode(params.nodeId)),
      )
      .handle("connect", ({ payload }) =>
        mapRepositoryError(catalog.connect(payload)),
      )
      .handle("disconnect", ({ params }) =>
        mapRepositoryError(catalog.disconnect(params.edgeId)),
      )
  }),
)
