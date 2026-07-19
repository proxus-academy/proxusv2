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
      .handle("getNode", ({ params }) => mapRepositoryError(catalog.getPublicNode(params.nodeId)))
      .handle("getEdge", ({ params }) => mapRepositoryError(catalog.getPublicEdge(params.edgeId)))
      .handle("listOutgoingEdges", ({ params }) => mapRepositoryError(catalog.listPublicOutgoingEdges(params.nodeId)))
      .handle("listIncomingEdges", ({ params }) => mapRepositoryError(catalog.listPublicIncomingEdges(params.nodeId)))
      .handle("listTargets", ({ params }) => mapRepositoryError(catalog.listPublicTargets(params.nodeId)))
      .handle("listSources", ({ params }) => mapRepositoryError(catalog.listPublicSources(params.nodeId)))
  }),
)
