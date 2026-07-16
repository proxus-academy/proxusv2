import { StudyCatalog, StudyCatalogRepositoryError } from "@proxus/backend-domain/study-catalog"
import { PublicApi } from "@proxus/shared/public-api"
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

    return handlers
      .handle("listCountries", () => mapRepositoryError(catalog.listCountries()))
      .handle("listRoots", () => mapRepositoryError(catalog.listRoots()))
      .handle("listChildren", ({ params }) => mapRepositoryError(catalog.listChildren(params.nodeId)))
      .handle("getNode", ({ params }) => mapRepositoryError(catalog.getNode(params.nodeId)))
      .handle("getEdge", ({ params }) => mapRepositoryError(catalog.getEdge(params.edgeId)))
      .handle("listOutgoingEdges", ({ params }) => mapRepositoryError(catalog.listOutgoingEdges(params.nodeId)))
      .handle("listIncomingEdges", ({ params }) => mapRepositoryError(catalog.listIncomingEdges(params.nodeId)))
      .handle("listTargets", ({ params }) => mapRepositoryError(catalog.listTargets(params.nodeId)))
      .handle("listSources", ({ params }) => mapRepositoryError(catalog.listSources(params.nodeId)))
  }),
)
